var assert = require('assert')
var Monotonic = require('monotonic').asString
var Scheduler = require('happenstance')
var push = [].push
var slice = [].slice
var RBTree = require('bintrees').RBTree
var logger = require('prolific.logger').createLogger('paxos')

function Legislator (id, options) {
    assert(arguments.length == 2, 'only two arguments now')
    options || (options = {})

    this.id = String(id)
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
    this.citizens = []
    this.minimum = '0/0'
}

Legislator.prototype._trace = function (method, vargs) {
    logger.trace(method, { $vargs: vargs })
}

Legislator.prototype.getPeer = function (id) {
    var peer = this.peers[id]
    if (peer == null) {
        peer = this.peers[id] = {
            id: id,
// Whoa. Which is it?
            when: -Infinity,
            timeout: 1,
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
    government.constituents = Object.keys(this.properties).sort().filter(function (citizen) {
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
    if (present.length + 1 < this.government.majority.length) {
        return null
    }
    var majority = [ this.id ].concat(present).slice(0, this.government.majority.length)
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
            var reshape = this._impeach() || this._expand() || this._shrink() || this._exile()
            if (reshape) {
                this.newGovernment(now, reshape.quorum, reshape.government, Monotonic.increment(this.promise, 0))
                isGovernment = true
            } else {
                this.ponged = false
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
                // assert(round, 'cannot find immigration')
                if (round == null) {
                    return false
                }
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
    return true
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
            var messages = []
            var pulse = {
                type: 'synchronize',
                islandId: this.islandId,
                governments: [ this.government.promise ],
                route: [ id ],
                messages: messages,
                failed: ! this._stuffSynchronize(now, peer, messages)
            }
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

            if (this.id == this.government.majority[0]) {
                this.getPeer(this.id).pinged = true
                this.getPeer(this.id).decided = this.log.max().promise
                this.minimum = this.citizens.reduce(function (minimum, citizen) {
                    if (minimum == null) {
                        return null
                    }
                    var peer = this.getPeer(citizen)
                    if (!peer.pinged) {
                        return null
                    }
                    return Monotonic.compare(peer.decided, minimum) < 0 ? peer.decided : minimum
                }.bind(this), this.log.max().promise) || this.minimum
            }
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
//            peer.pinged = true
            peer.skip = true
            this.ponged = true
            this.scheduler.schedule(now + this.ping, pulse.route[0], {
                object: this, method: '_whenPing'
            }, pulse.route[0])
            break
        }
    }
}

Legislator.prototype.bootstrap = function (now, islandId, properties) {
    this._trace('bootstrap', [ now, islandId, properties ])
    // Update current state as if we're already leader.
    this.naturalize()
    this.islandId = islandId
    this.government.majority.push(this.id)
    this.properties[this.id] = JSON.parse(JSON.stringify(properties))
    this.properties[this.id].immigrated = '1/0'
    this.newGovernment(now, [ this.id ], {
        majority: [ this.id ],
        minority: []
    }, '1/0')
}

Legislator.prototype.join = function (cookie, islandId) {
    this._trace('join', [ cookie, islandId ])
    this.cookie = cookie
    this.islandId = islandId
}

Legislator.prototype.naturalize = function () {
    this._trace('naturalize', [])
    this.naturalized = true
}

// TODO Is all this checking necessary? Is it necessary to return the island id
// and leader? This imagines that the client is going to do the retry, but in
// reality we often have the cluster performt the retry. The client needs to
// talk to a server that can be discovered, it can't use the Paxos algorithm for
// address resolution. From the suggested logic, it will only have a single
// address, and maybe be told of an actual leader. What happens when that
// address is lost? Don't see where returning `islandId` and leader helps at
// all. It is enough to say you failed, backoff and try again. The network layer
// can perform checks to see if the recepient is the leader and hop to the
// actual leader if it isn't, reject if it is but collapsed.
//
// Once you've externalized this in kibitz, remove it, or pare it down.
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
// TODO This is a note. I'd like to find a place to journal this. I'm continuing
// to take measures to allow for the reuse of ids. It still feels right to me
// that a display of government or of the census would be displayed using values
// meaningful to our dear user; Kubernetes HOSTNAMES, AWS instance names, IP
// address, and not something that is unique, which always means something that
// this verbose.
//
// Yet, here I am again contending with an issue that would be so simple if ids
// where required to be unique. When a citizen that is a constituent dies and
// restarts with the same id it will be pinged by someone in government, it will
// report that it's empty, and its representative will look for it's immigration
// record. There's a race now. Is the new instance going to immigrate before its
// pinged? Or is the representative going to search for an immigration record
// and not find one, which causes us to abend at the moment?
//
// I'd decided to resolve the missing record by syncing with a record that is
// poison and designed to fail. That takes care of the race when the
// representative beats the immigration record, but what if the immigration
// record beats the representative?
//
// In that case their will be a new government with the same represenative with
// the same consitutent, but now there will be an immigration record. The
// consituent will be naturalized. It will never have been exiled.
//
// This is a problem. Implementations are going to need to know that they've
// restarted. A participant should be exiled before it can immigrate again.
//
// Obviously, much easier if the ids are unique. Whole new id means not
// ambiguity. The new id immigrates, the old id exiles. (Unique ids are easy
// enough to foist upon our dear user implementation wise. Most implementations
// reset a process or at least an object, and that new instance can have a new
// id generated from POSIX time or UUID.)
//
// However, we do have an atomic log at our disposal, so every time I think that
// I should give up and go with unique ids, something comes along to make it
// simple. I was actually musing about how the client, if they really wanted
// pretty ids, they could just check and wait for the old id to exile, since it
// only needs to be unique in the set of current ids. Then, duh, I can do that
// same check on immigration and reject the immigration if the id already exists
// in the census.
//
// That's what you're looking at here.
//
// Now that that is done, though, is there a race condition where the
// immigration is currently being proposed? The property wouldn't be removed
// until the proposal was enacted.

//
        if (id in this.properties) {
            response = {
                enqueued: false,
                islandId: this.islandId,
                leader: this.government.majority[0]
            }
        } else {
// TODO However, are we checking that we're not proposing the same immigration
// twice if it added to the `immigrating` array while it is being proposed?
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

    // TODO Since we only ever increment by one, this could be more assertive
    // for the message number. However, I have to stop and recall whether we
    // skip values for the government number, and I'm pretty sure we do.
    //
    // TODO This implies that we can be very certain about a sync if we ensure
    // that there are no gaps in both the governemnt series and the message
    // series, which could be done by backfilling any gaps encountered during
    // failed rounds of Paxos.

    //
    var valid = Monotonic.compare(max.promise, message.promise) < 0

    // TODO Simply skip if it is bad, but now I'm considering failing because it
    // indicates something wrong on the part of the sender, but then the sender
    // will fail, so it will timeout and try to ping again. When it does it will
    // assume that it has correct values for `decided`.

    //
    if (!valid) {
        // tentative -> pulse.failed = true
        return
    }

    valid = max.promise != '0/0'
    if (!valid) {
        // TODO Seems to be a duplicate test.
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
    if (!pulse.failed) {
        var peer = this.getPeer(message.from)
        this.ponged = this.ponged || !peer.pinged || peer.timeout != message.timeout
        peer.pinged = true
        peer.timeout = message.timeout
        peer.naturalized = message.naturalized
        peer.decided = message.decided
        peer.when = null
    }
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
// TODO You can use `peer.timeout != 1` wherever you're using `peer.pinged`.
            if ((peer.pinged || peer.timeout > 1) && peer.id != message.from)  {
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
// TODO You've got some figuring to do; you went and made it so that synchronize
// will sent a `pulse` with a `failed` flag set. If that was the only place you
// where stuffing synchronize, you'd be done, but here you are. Are you going to
// find yourself in the same situation returning.
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

// Majority updates minority. Minority updates constituents. If there is
// no minority, then the majority updates constituents.

//
Legislator.prototype._determineConstituency = function () {
    this.constituency = []
    var parliament = this.government.majority.concat(this.government.minority)
    if (parliament.length == 1) {
        if (this.id == this.government.majority[0]) {
            this.constituency = this.government.constituents.slice()
        }
    } else {
        var index = this.government.majority.slice(1).indexOf(this.id)
        if (~index) {
            var length = this.government.majority.length - 1
            var population = this.government.minority.length
                           ? this.government.minority
                           : this.government.constituents
            this.constituency = population.filter(function (id, i) {
                return i % length == index
            })
        } else if (~(index = this.government.minority.indexOf(this.id))) {
            var length = this.government.minority.length
            this.constituency = this.government.constituents.filter(function (id, i) {
                return i % length == index
            })
        }
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

    this._determineConstituency()
    assert(!this.constituency.length || this.constituency[0] != null)
    this.scheduler.clear()
    if (this.government.majority[0] == this.id) {
        this.scheduler.schedule(now + this.ping, this.id, { object: this, method: '_whenKeepAlive' })
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
    // citizen is no longer downstream from the majority member, that stale
    // record will not get updated, but it will be reported to the leader.
    //
    // We keep peer information if we are the leader, since it all flows back to
    // the leader. All leader information will soon be updated. Not resetting
    // the leader during normal operation makes adjustments to citizenship go
    // faster.
    this.citizens = this.government.majority
                        .concat(this.government.minority)
                        .concat(this.government.constituents)
    if (this.id == this.government.majority[0]) {
        for (var id in this.peers) {
            if (! ~this.citizens.indexOf(id)) {
                delete this.peers[id]
            }
        }
    } else {
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

Legislator.prototype._naturalized = function (id) {
    var peer = this.peers[id] || {}
    return peer.naturalized && peer.timeout == 0
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
    // TODO This notion of reachable should include a test to ensure that the
    // minority is not so far behind that it cannot be caught up with the leader.
    var naturalized = parliament.slice(1).concat(this.government.constituents)
                                         .filter(this._naturalized.bind(this))
    var parliamentSize = Math.round(parliament.length / 2) * 2 + 1
    if (naturalized.length + 1 < parliamentSize) {
        return null
    }
    var majoritySize = Math.ceil(parliamentSize / 2)
    var growBy = 1
    if (parliament.length > 1) {
        // If we are a dictator, we can immediately grow to the next size
        // because no one else will compete with us in an election.
        if (this.government.majority.length < majoritySize) {
            return {
                // quorum: this.government.majority,
                quorum: parliament.slice(0, majoritySize),
                government: {
                    majority: parliament.slice(0, majoritySize),
                    minority: parliament.slice(majoritySize)
                }
            }
        }
    } else {
        growBy = 2
    }
    var newParliament = [ this.id ].concat(naturalized).slice(0, parliament.length + growBy)
    return {
        // quorum: this.government.majority,
        quorum: newParliament.slice(0, majoritySize),
        government: {
            majority: newParliament.slice(0, majoritySize),
            minority: newParliament.slice(majoritySize)
        }
    }
}

// Called after expand, so if we have a goverment that has lost a member of the
// minority, and was not able to replace it when it expanded, we know to kick
// another minority member so the goverment size will be at the next smalled odd
// number. Once there through shrink or impeachment, we'll see that the majority
// is too big and know that we can reshape the government to have a simple
// majority.
Legislator.prototype._shrink = function () {
    this._trace('_shrink', [])
    var parliament = this.government.majority.concat(this.government.minority)
    if (parliament.length == 1) {
        return null
    }
    if (parliament.length == 2) {
        return {
            quorum: this.government.majority,
            government: {
                majority: [ this.government.majority[0] ],
                minority: []
            }
        }
    }
    var parliamentSize = Math.floor(parliament.length / 2) * 2 + 1
    var majoritySize = Math.ceil(parliamentSize / 2)
    if (parliament.length % 2 == 0) {
        assert(this.government.majority.length == majoritySize)
        var minority = this.government.minority.slice()
        minority.pop()
        return {
            quorum: this.government.majority,
            government: {
                majority: this.government.majority.slice(),
                minority: minority
            }
        }
    }
    if (this.government.majority.length > majoritySize) {
        var majority = this.government.majority.slice()
        var minority = this.government.minority.slice()
        minority.push(majority.pop())
        return {
            quorum: this.government.majority,
            government: {
                majority: majority,
                minority: minority
            }
        }
    }
    assert(this.government.majority.length == majoritySize)
    return null
}

Legislator.prototype._timedout = function (id) {
    return this.peers[id] && this.peers[id].timeout >= this.timeout
}

Legislator.prototype._impeach = function () {
    this._trace('_impeach', [])
    assert(!this.collapsed)
    var timedout = this.government.minority.filter(this._timedout.bind(this))
    if (timedout.length == 0) {
        return null
    }
    var impeach = timedout.shift()
    var deducted = this.government.minority.filter(function (id) {
        return id != impeach
    })
    return {
        quorum: this.government.majority,
        government: {
            majority: this.government.majority,
            minority: deducted
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
