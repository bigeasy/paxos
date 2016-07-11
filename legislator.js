var assert = require('assert')
var Monotonic = require('monotonic').asString
var Scheduler = require('happenstance')
var push = [].push
var slice = [].slice
var RBTree = require('bintrees').RBTree
var logger = require('prolific.logger').createLogger('bigeasy.paxos')

function Legislator (islandId, id, cookie, options) {
    options || (options = {})

    this.islandId = islandId
    this.id = String(id)
    this.cookie = cookie
    this.naturalized = !! options.naturalized

    this.parliamentSize = options.parliamentSize || 5

    this.log = new RBTree(function (a, b) { return Monotonic.compare(a.promise, b.promise) })
    this.scheduler = new Scheduler(options.scheduler || {})
    this.synchronizing = {}

    this.proposals = []
    this.properties = {}
    this.immigrating = []
    this.keepAlive = false
    this.pulsing = false
    this.collapsed = false

    this.government = { promise: '0/0', minority: [], majority: [] }
    this.lastIssued = null
    this.promise = '0/0'

    this.peers = {}
    this.getPeer(this.id).timeout = 0

    this.length = options.length || 1024

// TODO Randomly adjust election retry by a percentage. Randomly half or
// randomly half as much again.

    this.ping = options.ping || 1
    this.timeout = options.timeout || 3

    this.log.insert({
        promise: '0/0',
        value: { government: this.government },
        quorum: [ this.id ],
        decisions: [ this.id ],
        decided: true
    })

    this.constituency = []
    this.operations = []
}

Legislator.prototype._trace = function (method, vargs) {
    logger.trace(method, { vargs: vargs })
}

Legislator.prototype.getPeer = function (id) {
    var peer = this.peers[id]
    if (peer == null) {
        peer = this.peers[id] = {
            id: id,
            when: -Infinity,
            timeout: 0,
            when: null,
// TODO Use a `null` decided instead.
            pinged: false,
            decided: '0/0'
        }
    }
    return peer
}

Legislator.prototype.newGovernment = function (now, quorum, government, promise) {
    this._trace('newGovernment', [ now, quorum, government, promise ])
    assert(!government.constituents)
    government.constituents = Object.keys(this.properties).filter(function (citizen) {
        return !~government.majority.indexOf(citizen)
            && !~government.minority.indexOf(citizen)
    })
// TODO Creating this reissue, but then I'm never using it.
    var remapped = government.promise = promise
    this.proposals = this.proposals.splice(0, this.proposals.length).map(function (proposal) {
        proposal.was = proposal.promise
        proposal.route = government.majority
        proposal.promise = remapped = Monotonic.increment(remapped, 1)
        return proposal
    }.bind(this))
    this.lastIssued = remapped
    var properties = JSON.parse(JSON.stringify(this.properties))
// TODO I'd rather have a more intelligent structure.
    if (government.immigrate) {
        properties[government.immigrate.id] = JSON.parse(JSON.stringify(government.immigrate.properties))
        properties[government.immigrate.id].immigrated = promise
        government.constituents.push(government.immigrate.id)
    }
    this.proposals.unshift({
        promise: promise,
        route: quorum,
        value: {
            type: 'government',
            islandId: this.islandId,
// TODO Choke up on this structure, move majority and minority up one.
            government: government,
            properties: properties,
// TODO Null map to indicate collapse or change in leadership. Wait, change in
// leader is only ever collapse? Ergo...
            collapsed: this.collapsed,
// There was a time when I wanted to allow the user to choose leaders.
            map: this.proposals.map(function (proposal) {
                return { was: proposal.was, is: proposal.promise }
            })
        }
    })
}

// TODO When we collapse, let's change our constituency to our parliament,
// except ourselves, to ensure that we're pinging away and waiting for a
// consensus to form. Wait, we're already doing that.
//
// TODO Okay, so let's create our constituency tree, so we know how to propagate
// messages back to the leader.
Legislator.prototype._gatherProposals = function (now) {
    var parliament = this.government.majority.concat(this.government.minority)
// TODO The constituent must be both connected and synchronized, not just
// connected.
    var present = this.parliament.filter(function (id) {
        var peer = this.peers[id] || {}
        return id != this.id && peer.timeout == 0
    }.bind(this))
    var majoritySize = Math.ceil(parliament.length / 2)
    if (present.length + 1 < majoritySize) {
        return null
    }
    var majority = [ this.id ].concat(present).slice(0, majoritySize)
    var minority = this.parliament.filter(function (id) { return ! ~majority.indexOf(id) })
    this.election = {
        status: 'proposing',
        majority: majority,
        minority: minority,
        promises: [],
        accepts: []
    }
    return {
        type: 'consensus',
        islandId: this.islandId,
        governments: [ this.government.promise ],
        route: majority,
        messages: [{
            type: 'propose',
            // Do not increment here, it will be set by `_receivePromise`.
            promise: Monotonic.increment(this.promise, 0)
        }]
    }
}

Legislator.prototype._advanceElection = function (now) {
// TODO Currently, your tests are running all synchronizations to completion
// before running a consensus pulse, so we're not seeing the results of decided
// upon a consensus action before all of the synchronizations have been
// returned.
    if (this.election.status == 'proposed') {
        assert(this.election.accepts.length == this.election.promises.length)
        this.collapsed = false
        return {
            type: 'consensus',
            islandId: this.islandId,
            governments: [ this.government.promise, this.accepted.promise ],
// TODO Real weird. Yes, at this point, we have definately accepted our own
// election, replacing whatever was accepted when we sent our proposal.
            route: this.accepted.route,
// TODO Does ping belong everywhere still?
            messages: [this._ping(now), {
                type: 'commit',
                promise: this.accepted.promise
            }]
        }
// TODO We'll never see this, so we should just assert it. It would be marked
// failed.
    } else {
        assert(this.election.promises.length == this.election.majority.length)
        this.election.status = 'proposed'
        this.newGovernment(now, this.election.majority, {
            majority: this.election.majority,
            minority: this.election.minority
        }, this.promise)
        return this._stuffProposal([ this._ping(now) ], this.proposals.shift())
    }
}

Legislator.prototype._twoPhaseCommit = function (now) {
    var messages = [ this._ping(now) ]
// TODO Bring immigration cleanup up here.
// TODO Tidy.

// TODO All this should be put into a function that checks for a next government
// and puts it onto a queue. It could jump the queue, sure, but I'm leaning
// toward just putting it in the queue in it's place.
//
// Actually, I'm in a hurry to grow the queue when the government is small, the
// worst case is when the government is only one member, so in that worst case,
// draining the queue is pretty much synchronous, pretty much instant.
//
// Pretty much.
    if (this.accepted && Monotonic.isBoundary(this.accepted.promise, 0)) {
        return {
            type: 'consensus',
            islandId: this.islandId,
            governments: [ this.government.promise, this.accepted.promise ],
            route: this.accepted.route,
            messages: [this._ping(now), {
                type: 'commit',
                promise: this.accepted.promise
            }]
        }
    }

    // Shift the ids any citizens that have already immigrated.
    while (
        this.immigrating.length != 0 &&
        this.properties[this.immigrating[0].id]
    ) {
        this.immigrating.shift()
    }

    var isGovernment = this.proposals.length &&
                       Monotonic.isBoundary(this.proposals[0].promise, 0)

    if (!isGovernment) {
        if (this.immigrating.length) {
            var immigration = this.immigrating.shift()
            this.newGovernment(now, this.government.majority, {
                majority: this.government.majority,
                minority: this.government.minority,
                immigrate: {
                    id: immigration.id,
                    properties: immigration.properties,
                    cookie: immigration.cookie
                }
            }, Monotonic.increment(this.promise, 0))
            isGovernment = true
        } else if (this.ponged) {
            var reshape = this._impeach() || this._exile() || this._expand()
            if (reshape) {
                this.ponged = false
                this.newGovernment(now, reshape.quorum, reshape.government, Monotonic.increment(this.promise, 0))
                isGovernment = true
            }
        }
    }

    if (this.accepted != null) {
        messages.push({
            type: 'commit',
            promise: this.accepted.promise
        })
        if (this.proposals.length == 0 || isGovernment) {
            return {
                type: 'consensus',
                islandId: this.islandId,
                governments: [ this.government.promise ],
                route: this.accepted.route,
                messages: messages
            }
        }
    }

    var proposal = this.proposals.shift()
    if (proposal != null) {
        return this._stuffProposal(messages, proposal)
    }

    if (this.keepAlive) {
        this.keepAlive = false
        return {
            type: 'consensus',
            islandId: this.islandId,
            governments: [ this.government.promise ],
            route: this.government.majority,
            messages: [ this._ping(now) ]
        }
    }

    return null
}

Legislator.prototype._consensus = function (now) {
    this._trace('consensus', [ now ])
    if (this.collapsed) {
        if (this.election) {
            return this._advanceElection(now)
        } else {
            return this._gatherProposals(now)
        }
    } else if (this.government.majority[0] != this.id) {
        return null
    }
    return this._twoPhaseCommit(now)
}

Legislator.prototype._stuffProposal = function (messages, proposal) {
    proposal.route.slice(1).forEach(function (id) {
        var peer = this.getPeer(id)
        assert(peer.pinged)
        var round = this.log.find({ promise: peer.decided }).next
        this._pushEnactments(messages, round, -1)
    }, this)
    var previous = this.collapsed ? this.accepted : null
    messages.push({
        type: 'accept',
        promise: proposal.promise,
        value: proposal.value,
        previous: previous
    })
    return {
        type: 'consensus',
        islandId: this.islandId,
        governments: [ this.government.promise ],
        route: proposal.route.slice(),
        messages: messages
    }
}

Legislator.prototype.consensus = function (now) {
    this._trace('consensus', [ now ])
    var pulse = null
    if (!this.pulsing) {
        pulse = this._consensus(now)
        this.pulsing = !! pulse
    }
    return pulse
}

Legislator.prototype._stuffSynchronize = function (now, peer, messages) {
    var count = 20
    var maximum = peer.decided
    if (peer.pinged) {
        var round
        if (peer.decided == '0/0') {
            var iterator = this.log.iterator()
            for (;;) {
                round = iterator.prev()
// TODO This will abend if the naturalization falls off the end end of the log.
// You need to check for gaps and missing naturalizations and then timeout the
// constituents that will never be connected.
                assert(round, 'cannot find immigration')
                if (Monotonic.isBoundary(round.promise, 0)) {
                    var immigrate = round.value.government.immigrate
                    if (immigrate && immigrate.id == peer.id) {
                        maximum = round.promise
                        break
                    }
                }
            }
        } else {
// TODO Got a read property of null here.
            round = this.log.find({ promise: maximum }).next
        }

        this._pushEnactments(messages, round, count)
    }
}

Legislator.prototype.synchronize = function (now) {
    this._trace('synchronize', [ now ])
    var outbox = []
    for (var i = 0, I = this.constituency.length; i < I; i++) {
        var id = this.constituency[i]
        var peer = this.getPeer(id)
        var compare = Monotonic.compare(this.getPeer(id).decided, this.getPeer(this.id).decided)
// TODO Extract this so I can send it back with pong in response to ping.
// TODO What is skip? Why do I need it?
// TODO Can I remove the need to track skip and synchronize? Add state to the
// pulse so that I don't have to track it in the Legislator?
        if ((peer.timeout != 0 || compare < 0) && !peer.skip && !this.synchronizing[id]) {
            this.synchronizing[id] = true
            var pulse = {
                type: 'synchronize',
                islandId: this.islandId,
                governments: [ this.government.promise ],
                route: [ id ],
                messages: []
            }
            this._stuffSynchronize(now, peer, pulse.messages)
            pulse.messages.push(this._pong(now))
            pulse.messages.push(this._ping(now))
            outbox.push(pulse)
        }
    }
    return outbox
}

Legislator.prototype._pushEnactments = function (messages, round, count) {
    while (--count && round) {
        messages.push({
            type: 'enact',
            promise: round.promise,
            value: round.value
        })
        round = round.next
    }
}

Legislator.prototype.receive = function (now, pulse, messages) {
    this._trace('receive', [ now, pulse, messages ])
    assert(arguments.length == 3 && now != null)
    var responses = []
    for (var i = 0, I = messages.length; i < I; i++) {
        var message = messages[i]
        var type = message.type
        var method = '_receive' + type[0].toUpperCase() + type.substring(1)
        this[method].call(this, now, pulse, message, responses)
    }
    return responses
}

Legislator.prototype.collapse = function () {
    this._trace('collapse', [])
// TODO Combine into a single state flag.
    this.collapsed = true
    this.election = null
    // Blast all queued work.
    this.proposals.length = 0
    this.immigrating.length = 0
    // Blast all knowledge of peers.
    for (var id in this.peers) {
        if (id != this.id) {
            delete this.peers[id]
        }
    }
    // Ping other parliament members until we can form a government.
    this.constituency = this.government.majority
                                       .concat(this.government.minority)
                                       .filter(function (id) {
        return this.id != id
    }.bind(this))
}

Legislator.prototype.sent = function (now, pulse, responses) {
    this._trace('sent', [ now, pulse, responses ])
    if (pulse.type == 'consensus') {
        this.pulsing = false
    }
// TODO Sense that it is easier to keep an array of governments from and to that
// might have a duplicate government, but it's just a sense, and as I write
// this, I sense that it is wrong.
    if (!~pulse.governments.indexOf(this.government.promise)) {
        return
    }
    var success = true
    pulse.route.forEach(function (id) {
        if (responses[id] == null) {
            success = false
        } else {
            this.receive(now, pulse, responses[id])
        }
    }, this)
    success = success && !pulse.failed
    if (success) {
        switch (pulse.type) {
        case 'synchronize':
            delete this.synchronizing[pulse.route[0]]
            this.scheduler.schedule(now + this.ping, pulse.route[0], { object: this, method: '_whenPing' }, pulse.route[0])
            break
        case 'consensus':
            this.scheduler.schedule(now + this.ping, this.id, { object: this, method: '_whenKeepAlive' })
            break
        }
    } else {
        switch (pulse.type) {
        case 'consensus':
            this.collapse()
            break
        case 'synchronize':
            delete this.synchronizing[pulse.route[0]]
// TODO Make this a call to receive ping.
            var peer = this.getPeer(pulse.route[0])
            if (peer.when == null) {
                peer.when = now
                peer.timeout = 1
            } else {
                peer.timeout = now - peer.when
            }
            peer.skip = true
            this.ponged = true
            this.scheduler.schedule(now + this.ping, pulse.route[0], {
                object: this, method: '_whenPing'
            }, pulse.route[0])
            break
        }
    }
}

Legislator.prototype.bootstrap = function (now, properties) {
    this._trace('bootstrap', [ now, properties ])
    // Update current state as if we're already leader.
    this.government.majority.push(this.id)
    this.properties[this.id] = JSON.parse(JSON.stringify(properties))
    this.properties[this.id].immigrated = '1/0'
    this.newGovernment(now, [ this.id ], {
        majority: [ this.id ],
        minority: []
    }, '1/0')
}

Legislator.prototype._enqueuable = function (islandId) {
    this._trace('_enqueuable', [ islandId ])
    if (this.collapsed || this.islandId != islandId) {
        return {
            enqueued: false,
            islandId: this.islandId,
            leader: null
        }
    }
    if (this.government.majority[0] != this.id) {
        return {
            enqueued: false,
            islandId: this.islandId,
            leader: this.government.majority[0]
        }
    }
}

// Note that a client will have to treat a network failure on submission as a
// failure requiring boundary detection.
Legislator.prototype.enqueue = function (now, islandId, message) {
    this._trace('enqueue', [ now, islandId, message ])

    var response = this._enqueuable(islandId)
    if (response == null) {
// TODO Bombs out the current working promise.
        var promise = this.lastIssued = Monotonic.increment(this.lastIssued, 1)
        this.proposals.push({
            promise: promise,
            route: this.government.majority,
            value: message
        })

        response = {
            enqueued: true,
            leader: this.government.majority[0],
            promise: promise
        }
    }

    return response
}

Legislator.prototype.immigrate = function (now, islandId, id, cookie, properties) {
    this._trace('immigrate', [ now, islandId, id, cookie, properties ])
    assert(typeof id == 'string', 'id must be a hexidecmimal string')
    var response = this._enqueuable(islandId)
    if (response == null) {
        this.immigrating = this.immigrating.filter(function (immigration) {
            return immigration.id != id
        })
        this.immigrating.push({
            type: 'immigrate',
            id: id,
            properties: properties,
            cookie: cookie
        })
        response = { enqueued: true, promise: null }
    }
    return response
}

Legislator.prototype._reject = function (message) {
    this._trace('_reject', [ message ])
    return {
        type: 'reject',
        from: this.id,
        government: this.government.pulse,
        promised: this.promise
    }
}

Legislator.prototype._receiveReject = function (now, pulse, message) {
    this._trace('_receiveReject', [ now, pulse, message ])
    pulse.failed = true
}

Legislator.prototype._receivePropose = function (now, pulse, message, responses) {
    this._trace('_receivePropose', [ now, pulse, message, responses ])
// TODO Mark as collapsed, call `collapse`, let `collapse` decide?
    if (this._rejected(pulse, function (promise) {
        return Monotonic.compare(message.promise, promise) <= 0
    })) {
        responses.push(this._reject(message))
    } else {
        responses.push({
            type: 'promise',
            from: this.id,
// TODO Okay to bomb out here, we're resetting, won't be a leader I don't think.
// Should this force a collapse?
            promise: this.promise = message.promise,
            accepted: this.accepted
        })
    }
}

Legislator.prototype._receivePromise = function (now, pulse, message, responses) {
    this._trace('_receivePromise', [ now, pulse, message, responses ])
    // We won't get called if our government has been superceeded.
    assert(~pulse.governments.indexOf(this.government.promise), 'goverment mismatch')
    assert(this.election, 'no election')
    assert(!~this.election.promises.indexOf(message.from), 'duplicate promise')
    assert(~this.election.majority.indexOf(message.from), 'promise not in majority')
    this.election.promises.push(message.from)
    if (message.accepted == null) {
        return
    }
    if (this.accepted == null ||
        Monotonic.compareIndex(this.accepted.promise, message.accepted.promise, 0) < 0
    ) {
        this.accepted = message.accepted
    }
}

Legislator.prototype._rejected = function (pulse, comparator) {
    if (pulse.islandId != this.islandId) {
        return true
    }
    if (! ~pulse.governments.indexOf(this.government.promise)) {
        return true
    }
    return comparator(this.promise)
}

// The accepted message must go out on the pulse, we cannot put it in the
// unrouted list and then count on it to get drawn into a pulse, because the
// leader needs to know if the message failed. The only way the leader will know
// is if the message rides a pulse. This is worth noting because I thought, "the
// only place where the pulse matters is in the leader, it does not need to be a
// property of the legislator, it can just be a property of an envelope that
// describes a route." Not so. The message should be kept with the route and it
// should only go out when that route is pulsed. If the network calls fail, the
// leader will be able to learn immediately.

Legislator.prototype._receiveAccept = function (now, pulse, message, responses) {
    this._trace('_receiveAccept', [ now, pulse, message, responses ])
// TODO Think hard; will this less than catch both two-stage commit and Paxos?
    if (this._rejected(pulse, function (promise) {
        return Monotonic.compareIndex(promise, message.promise, 0) > 0
    })) {
        responses.push(this._reject(message))
    } else {
        this.accepted = JSON.parse(JSON.stringify(message))
// TODO Definately bombs out our latest working, issued promise...
        this.promise = this.accepted.promise
        this.accepted.route = pulse.route
        responses.push({
            type: 'accepted',
            from: this.id,
// TODO ... and bombs it out again.
            promise: this.promise = message.promise,
            accepted: this.accepted
        })
    }
}

Legislator.prototype._receiveAccepted = function (now, pulse, message) {
    this._trace('_receiveAccepted', [ now, pulse, message ])
    assert(~pulse.governments.indexOf(this.government.promise))
    if (this.election) {
        assert(!~this.election.accepts.indexOf(message.from))
        this.election.accepts.push(message.from)
    }
}

// What happens if you recieve a commit message during a collapse? Currently,
// you could be sending a commit message out on the pulse of a new promise. You
// need to make sure that you don't send the commit, ah, but if you'd sent a new
// promise, you would already have worked through these things.
Legislator.prototype._receiveCommit = function (now, pulse, message, responses) {
    this._trace('_receiveCommit', [ now, pulse, message, responses ])
    if (this._rejected(pulse, function (promise) {
        return promise != message.promise
    })) {
        responses.push(this._reject(message))
    } else {
        var round = this.accepted

        this.accepted = null

        var rounds = []
        while (round) {
            rounds.push(round)
            var next = round.previous
            round.previous = null
            round = next
        }

        rounds.forEach(function (round) {
            this._receiveEnact(now, pulse, round)
        }, this)
    }
}

Legislator.prototype._receiveEnact = function (now, pulse, message) {
    this._trace('_receiveEnact', [ now, pulse, message ])

    this.proposal = null
    this.accepted = null
    this.collapsed = false
    this.election = false

    message = JSON.parse(JSON.stringify(message))

    var max = this.log.max()

    var valid = Monotonic.compare(max.promise, message.promise) < 0

    if (!valid) {
// TODO When is this called?
        return
    }

    valid = max.promise != '0/0'
    if (!valid) {
        valid = max.promise == '0/0' && message.promise == '1/0'
    }
    if (!valid) {
        assert(this.log.size == 1)
        valid = Monotonic.isBoundary(message.promise, 0)
        valid = valid && this.log.min().promise == '0/0'
        valid = valid && message.value.government.immigrate
        valid = valid && message.value.government.immigrate.id == this.id
        valid = valid && message.value.government.immigrate.cookie == this.cookie
    }
    if (!valid) {
        pulse.failed = true
        return
    }

// TODO How crufy are these log entries? What else is lying around in them?
    max.next = message
    message.previous = max.promise
    this.log.insert(message)
// Forever bombing out our latest promise.
    this.promise = message.promise

    if (Monotonic.isBoundary(message.promise, 0)) {
        this._enactGovernment(now, message)
    }

    this.getPeer(this.id).decided = message.promise
}

Legislator.prototype._ping = function (now) {
    return { type: 'ping', from: this.id, collapsed: this.collapsed }
}

Legislator.prototype._pong = function (now) {
    return {
        type: 'pong',
        from: this.id,
        timeout: 0,
        when: now,
        naturalized: this.naturalized,
        decided: this.peers[this.id].decided
    }
}

Legislator.prototype._whenKeepAlive = function (now) {
    this._trace('_whenKeepAlive', [])
    this.keepAlive = true
}

Legislator.prototype._whenPing = function (now, id) {
    this._trace('_whenPing', [ now, id ])
    var peer = this.getPeer(id)
// TODO Skip is so dubious.
    peer.skip = false
    if (peer.timeout == 0) {
        peer.timeout = 1
    }
}

Legislator.prototype._receivePong = function (now, pulse, message, responses) {
    this._trace('_receivePong', [ now, pulse, message, responses ])
    var peer = this.getPeer(message.from)
    this.ponged = this.ponged || !peer.pinged || peer.timeout != message.timeout
    peer.pinged = true
    peer.timeout = message.timeout
    peer.naturalized = message.naturalized
    peer.decided = message.decided
    peer.when = null
}

Legislator.prototype._receivePing = function (now, pulse, message, responses) {
    this._trace('_receivePing', [ now, pulse, message, responses ])
    if (message.from == this.id) {
        return
    }
// TODO Keep a tree to determine if a majority member needs to return the
// values send by a minority member, for now send everything.
    responses.push(this._pong(now))
    if (!message.collapsed) {
        for (var id in this.peers) {
            var peer = this.peers[id]
            if (peer.pinged && peer.id != message.from)  {
                responses.push({
                    type: 'pong',
                    from: peer.id,
                    timeout: peer.timeout,
                    when: peer.when,
                    naturalized: peer.naturalized,
                    decided: peer.decided
                })
            }
        }
    }
    var peer = this.getPeer(message.from)
    if (pulse.type == 'synchronize' && Monotonic.compare(peer.decided, this.peers[this.id].decided) < 0) {
        this._stuffSynchronize(now, this.getPeer(message.from), responses)
    }
// TODO Are you setting/unsetting this correctly when you are collapsed?
    var resetWhenCollapse =
        ~this.government.majority.slice(1).indexOf(this.id) &&
        !this.collapsed &&
        message.from == this.government.majority[0]
    if (resetWhenCollapse) {
        this.scheduler.schedule(now + this.timeout, this.id, {
            object: this, method: '_whenCollapse'
        })
    }
}

Legislator.prototype._enactGovernment = function (now, round) {
    this._trace('_enactGovernment', [ now, round ])
    delete this.election
    this.collapsed = false

    assert(Monotonic.compare(this.government.promise, round.promise) < 0, 'governments out of order')

    // when we vote to shrink the government, the initial vote has a greater
    // quorum than the resulting government. Not sure why this comment is here.
    this.government = JSON.parse(JSON.stringify(round.value.government))
    this.properties = JSON.parse(JSON.stringify(round.value.properties))

    if (this.government.exile) {
        var index = this.government.constituents.indexOf(this.government.exile)
        this.government.constituents.splice(index, 1)
        delete this.properties[this.government.exile]
        delete this.peers[this.government.exile]
    }

    if (this.id != this.government.majority[0]) {
        this.proposals.length = 0
    }

// TODO Decide on whether this is calculated here or as needed.
    this.parliament = this.government.majority.concat(this.government.minority)

    this.constituency = []
    if (this.parliament.length == 1) {
        if (this.id == this.government.majority[0]) {
            this.constituency = this.government.constituents.slice()
        }
    } else {
        var index = this.government.majority.slice(1).indexOf(this.id)
        if (~index) { // Majority updates minority.
            var length = this.government.majority.length - 1
            this.constituency = this.government.minority.filter(function (id, i) {
                return i % length == index
            })
            assert(this.government.minority.length != 0, 'no minority')
        } else {
            var index = this.government.minority.indexOf(this.id)
            if (~index) { // Minority updates constituents.
                var length = this.government.minority.length
                this.constituency = this.government.constituents.filter(function (id, i) {
                    return i % length == index
                })
            }
        }
    }
    assert(!this.constituency.length || this.constituency[0] != null)
    this.scheduler.clear()
    if (this.government.majority[0] == this.id) {
        this.scheduler.schedule(now + this.ping, this.id, { object: this, method: '_whenPulse' })
    } else if (~this.government.majority.slice(1).indexOf(this.id)) {
        this.scheduler.schedule(now + this.timeout, this.id, { object: this, method: '_whenCollapse' })
    }

    this.constituency.forEach(function (id) {
        this.scheduler.schedule(now + this.ping, id, { object: this, method: '_whenPing' }, id)
    }, this)

    // Reset peer tracking information. Leader behavior is different from other
    // members. We clear out all peer information for peers who are not our
    // immediate constituents. This will keep us from hoarding stale peer
    // records. When everyone performs this cleaning, we can then trust
    // ourselves to return all peer information we've gathered to anyone that
    // pings us, knowing that it is all flowing from minority members to the
    // leader. We do not have to version the records, timestamp them, etc.
    //
    // If we didn't clear them out, then a stale record for a citizen can be
    // held onto by a majority member. If the minority member that pings the
    // citizen is no longer downstream from the majortiy member, that stale
    // record will not get updated, but it will be reported to the leader.
    //
    // We keep peer information if we are the leader, since it all flows back to
    // the leader. All leader information will soon be updated. Not resetting
    // the leader during normal operation makes adjustments to citizenship go
    // faster.
    if (this.id != this.government.majority[0]) {
        for (var id in this.peers) {
            if (this.id != id && ! ~this.constituency.indexOf(id)) {
                delete this.peers[id]
            }
        }
    }
}

Legislator.prototype._whenCollapse = function () {
    this._trace('_whenCollapse', [])
    this.collapse()
}

// TODO I don't believe I need to form a new government indicating that I've
// naturalized, merely record that I've been naturalized. It is a property that
// will return with liveness.
Legislator.prototype._expand = function () {
    this._trace('_expand', [])
    assert(!this.collapsed)
    var parliament = this.government.majority.concat(this.government.minority)
    if (parliament.length == this.parliamentSize) {
        return null
    }
    assert(~this.government.majority.indexOf(this.id), 'would be leader not in majority')
    var parliamentSize = parliament.length + 2
// TODO This notion of reachable should include a test to ensure that the
// minority is not so far behind that it cannot be caught up with the leader.
    var present = parliament.slice(1).concat(this.government.constituents).filter(function (id) {
        var peer = this.peers[id] || {}
        return peer.naturalized && peer.timeout == 0
    }.bind(this))
    if (present.length + 1 < parliamentSize) {
        return null
    }
    var newParliament = [ this.id ].concat(present).slice(0, parliamentSize)
    var majoritySize = Math.ceil(parliamentSize / 2)
    return {
        // quorum: this.government.majority,
        quorum: newParliament.slice(0, majoritySize),
        government: {
            majority: newParliament.slice(0, majoritySize),
            minority: newParliament.slice(majoritySize)
        }
    }
}

Legislator.prototype._impeach = function () {
    this._trace('_impeach', [])
    assert(!this.collapsed)
    var timedout = this.government.minority.filter(function (id) {
        return this.peers[id] && this.peers[id].timeout >= this.timeout
    }.bind(this)).length != 0
    if (!timedout) {
        return null
    }
    var candidates = this.government.minority.concat(this.government.constituents)
    var minority = candidates.filter(function (id) {
        return this.peers[id] && this.peers[id].timeout < this.timeout
    }.bind(this)).slice(0, this.government.minority.length)
    if (minority.length == this.government.minority.length) {
        return {
            majority: this.government.majority,
            minority: minority
        }
    }
    var parliament = this.government.majority.concat(this.government.minority)
    var parliamentSize = parliament.length <= 3 ? 1 : 3
    var newParliament = this.government.majority.slice(0, parliamentSize)
    var majoritySize = Math.ceil(parliamentSize / 2)
    return {
        quorum: this.government.majority,
        government: {
            majority: newParliament.slice(0, majoritySize),
            minority: newParliament.slice(majoritySize)
        }
    }
}

Legislator.prototype._exile = function () {
    this._trace('_exile', [])
    assert(!this.collapsed)
    var responsive = this.government.constituents.filter(function (id) {
        return !this.peers[id] || this.peers[id].timeout < this.timeout
    }.bind(this))
    if (responsive.length == this.government.constituents.length) {
        return null
    }
    var exiles = this.government.constituents.filter(function (id) {
        return this.peers[id] && this.peers[id].timeout >= this.timeout
    }.bind(this))
    return {
        quorum: this.government.majority,
        government: {
            majority: this.government.majority,
            minority: this.government.minority,
            exile: exiles.shift()
        }
    }
}

module.exports = Legislator
