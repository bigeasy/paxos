var assert = require('assert')
var Monotonic = require('monotonic').asString
var Scheduler = require('happenstance')
var push = [].push
var slice = [].slice
var RBTree = require('bintrees').RBTree
var logger = require('prolific').createLogger('bigeasy.paxos')

function Legislator (islandId, id, cookie, options) {
    options || (options = {})

    this.islandId = islandId
    this.id = id
    this.cookie = cookie

    this.parliamentSize = options.parliamentSize || 5

    this.log = new RBTree(function (a, b) { return Monotonic.compare(a.promise, b.promise) })
    this.scheduler = new Scheduler(options.scheduler || {})
    this.synchronizing = {}

    this.proposals = []
    this.locations = {}
    this.pulse = false
    this.naturalizing = []
    this.collapsed = false

    this.government = { promise: '0/0', minority: [], majority: [] }
    this.promise = '0/0'
    this.citizens = []

    this._peers = {}
    this.getPeer(this.id).timeout = 0

    this.length = options.length || 1024

    assert(!Array.isArray(options.retry), 'retry no longer accepts range')
    assert(!Array.isArray(options.ping), 'retry no longer accepts range')
    assert(!Array.isArray(options.timeout), 'retry no longer accepts range')

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
}

function trace (method, vargs) {
    logger.trace(method, { vargs: vargs })
}

Legislator.prototype.getPeer = function (id) {
    trace('getPeer', [ id ])
    var peer = this._peers[id]
    if (peer == null) {
        return peer = this._peers[id] = {
            timeout: 0,
            when: null,
            pinged: false,
            decided: '0/0'
        }
    }
    return peer
}

Legislator.prototype.newGovernment = function (now, quorum, government, promise) {
    trace('newGovernment', [ now, quorum, government, promise ])
    assert(!government.constituents)
    government.constituents = this.citizens.filter(function (citizen) {
        return !~government.majority.indexOf(citizen)
            && !~government.minority.indexOf(citizen)
    })
    var remapped = government.promise = promise
    this.proposals = this.proposals.splice(0, this.proposals.length).map(function (proposal) {
        proposal.was = proposal.promise
        proposal.route = government.majority
        proposal.promise = remapped = Monotonic.increment(remapped, 1)
        return proposal
    }.bind(this))
    this.proposals.unshift({
        promise: promise,
        route: quorum,
        value: {
            type: 'government',
            islandId: this.islandId,
            government: government,
            locations: this.locations,
            map: this.proposals.map(function (proposal) {
                return { was: proposal.was, is: proposal.promise }
            })
        }
    })
}

Legislator.prototype._consensus = function (now) {
    trace('consensus', [ now ])
    // Shift any naturalizing citizens that have already naturalized.
    while (
        this.naturalizing.length != 0 &&
        ~this.citizens.indexOf(this.naturalizing[0].id)
    ) {
        this.naturalizing.shift()
    }
    if (this.collapsed) {
        if (this.election) {
// TODO Currently, your tests are running all synchronizations to completion
// before running a consensus pulse, so we're not seeing the results of decided
// upon a consensus action before all of the synchronizations have been
// returned.
            if (this.election.status == 'accepted') {
                return null
            } else if (this.election.status == 'proposed') {
                if (this.election.accepts.length == this.election.promises.length) {
                    this.election.status = 'accepted'
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
                return null
            } else if (this.election.promises.length < this.election.majority.length) {
                return null
            } else {
                this.election.status = 'proposed'
                this.newGovernment(now, this.election.majority, {
                    majority: this.election.majority,
                    minority: this.election.minority
                }, this.promise)
            }
        } else {
            var parliament = this.government.majority.concat(this.government.minority)
            var unknown = { timeout: 1 }
// TODO The constituent must be both connected and synchronized, not just
// connected.
            var present = this.parliament.filter(function (id) {
                return id != this.id && (this._peers[id] || unknown).timeout == 0
            }.bind(this))
            var majoritySize = Math.ceil(parliament.length / 2)
            if (present.length < majoritySize) {
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
    } else if (this.government.majority[0] == this.id && this.accepted && Monotonic.isBoundary(this.accepted.promise, 0)) {
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
    } else if (this.naturalizing.length && this.government.majority[0] == this.id) {
        var naturalization = this.naturalizing.shift()
        this.newGovernment(now, this.government.majority, {
            majority: this.government.majority,
            minority: this.government.minority,
            naturalize: {
                id: naturalization.id,
                location: naturalization.location,
                cookie: naturalization.cookie
            }
        }, Monotonic.increment(this.promise, 0))
    } else if (this.ponged && this.id == this.government.majority[0]) {
        var reshape = this._impeach() || this._exile() || this._expand()
        if (reshape) {
            this.ponged = false
            this.newGovernment(now, reshape.quorum, reshape.government, Monotonic.increment(this.promise, 0))
        }
    }
    var proposal = this.proposals[0]
    var messages = [ this._ping(now) ]
    if (this.accepted != null) {
        messages.push({
            type: 'commit',
            promise: this.accepted.promise
        })
        if (proposal == null || !this._routeEqual(proposal.route, this.accepted.route)) {
            return {
                type: 'consensus',
                islandId: this.islandId,
                governments: [ this.government.promise ],
                route: this.accepted.route,
                messages: messages
            }
        }
    }
    if (proposal) {
        messages.push({
            type: 'accept',
            promise: proposal.promise,
            value: proposal.value
        })
        this.proposals.shift()
        return {
            type: 'consensus',
            islandId: this.islandId,
            governments: [ this.government.promise ],
            route: proposal.route.slice(),
            messages: messages
        }
    }
    if (this.pulse) {
        this.pulse = false
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

Legislator.prototype.consensus = function (now) {
    var pulse = null
    if (!this._pulse) {
        pulse = this._consensus(now)
        this._pulse = !! pulse
    }
    return pulse
}


Legislator.prototype.synchronize = function (now) {
    trace('synchronize', [ now ])
    var outbox = []
    for (var i = 0, I = this.constituency.length; i < I; i++) {
        var id = this.constituency[i]
        var peer = this.getPeer(id)
        var compare = Monotonic.compare(this.getPeer(id).decided, this.getPeer(this.id).decided)
        if ((peer.timeout != 0 || compare < 0) && !peer.skip && !this.synchronizing[id]) {
            var count = 20
            this.synchronizing[id] = true
            var pulse = {
                type: 'synchronize',
                islandId: this.islandId,
                governments: [ this.government.promise ],
                route: [ id ],
                messages: []
            }

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
                        assert(round, 'cannot find naturalization')
                        if (Monotonic.isBoundary(round.promise, 0)) {
                            var naturalize = round.value.government.naturalize
                            if (naturalize && naturalize.id == id) {
                                maximum = round.promise
                                break
                            }
                        }
                    }
                } else {
                    round = this.log.find({ promise: maximum }).next
                }

                while (--count && round) {
                    pulse.messages.push({
                        type: 'enact',
                        promise: round.promise,
                        value: round.value
                    })
                    round = round.next
                }
            }

            pulse.messages.push(this._ping(now))

            outbox.push(pulse)
        }
    }
    return outbox
}

Legislator.prototype.receive = function (now, pulse, messages) {
    trace('_receive', [ now, pulse, messages ])
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
    trace('collapse', [])
    this.collapsed = true
    this.election = null
    this.proposals.length = 0
    this.naturalizing.length = 0
    for (var id in this._peers) {
        if (id != this.id) {
            delete this._peers[id]
        }
    }
    var parliament = this.government.majority.concat(this.government.minority)
    this.constituency = parliament.filter(function (id) {
        return this.id != id
    }.bind(this))
}

Legislator.prototype.sent = function (now, pulse, responses) {
    trace('sent', [ now, pulse, responses ])
    if (pulse.type == 'consensus') {
        this._pulse = false
    }
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
            this.scheduler.schedule(now + this.ping, this.id, { object: this, method: '_whenPulse' })
            break
        }
    } else {
        switch (pulse.type) {
        case 'consensus':
            this.collapse()
            break
        case 'synchronize':
            delete this.synchronizing[pulse.route[0]]
            var peer = this.getPeer(pulse.route[0])
            if (peer.when == null) {
                peer.when = now
                peer.timeout = 1
            } else {
                peer.timeout = now - peer.when
            }
            peer.skip = true
            this.ponged = true
            this.scheduler.schedule(now + this.ping, pulse.route[0], { object:
            this, method: '_whenPing' }, pulse.route[0])
            break
        }
    }
}

Legislator.prototype.bootstrap = function (now, location) {
    trace('bootstrap', [ now, location ])
    // Update current state as if we're already leader.
    this.government.majority.push(this.id)
    this.locations[this.id] = location
    this.citizens = [ this.id ]
    this.newGovernment(now, [ this.id ], {
        majority: [ this.id ],
        minority: []
    }, '1/0')
}

Legislator.prototype._enqueuable = function (islandId) {
    trace('_enqueuable', [ islandId ])
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
    trace('enqueue', [ now, message ])

    var response = this._enqueuable(islandId)
    if (response == null) {
        var promise = this.promise = Monotonic.increment(this.promise, 1)
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

// TODO Reject duplicate naturalization or override. Reject already naturalized,
// but you have to do that at ingest of naturalization.
Legislator.prototype.naturalize = function (now, islandId, id, cookie, location) {
    trace('naturalize', [ now, id, cookie, location ])
    assert(typeof id == 'string', 'id must be a hexidecmimal string')
    var response = this._enqueuable(islandId)
    if (response == null) {
        this.naturalizing = this.naturalizing.filter(function (naturalization) {
            return naturalization.id != id
        })
        this.naturalizing.push({
            type: 'naturalize',
            id: id,
            location: location,
            cookie: cookie
        })
        response = { enqueued: true, promise: null }
    }
    return response
}

// TODO When would the routes not be equal. You always clear out the previous
// government before you begin the business of the pulse.
Legislator.prototype._routeEqual = function (a, b) {
    if (a.length != b.length) {
        return false
    }
    return a.filter(function (value, index) {
        return b[index] == value
    }).length == a.length
}

Legislator.prototype._reject = function (message) {
    trace('_reject', [ message ])
    return {
        type: 'reject',
        from: this.id,
        government: this.government.pulse,
        promised: this.promise
    }
}

Legislator.prototype._receiveReject = function (now, pulse, message) {
    trace('_receiveReject', [ now, pulse, message ])
    pulse.failed = false
}

Legislator.prototype._receivePropose = function (now, pulse, message, responses) {
    trace('_receivePropose', [ now, pulse, message, responses ])
    var compare = Monotonic.compare(message.promise, this.promise)
    if (this.islandId != pulse.islandId ||
        compare <= 0 ||
        !~pulse.governments.indexOf(this.government.promise)
    ) {
        responses.push(this._reject(message))
    } else {
        responses.push({
            type: 'promise',
            from: this.id,
            promise: this.promise = message.promise,
            accepted: this.accepted
        })
    }
}

Legislator.prototype._receivePromise = function (now, pulse, message, responses) {
    trace('_receivePromise', [ now, pulse, message, responses ])
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
        message.accepted.previous = this.accepted
        this.accepted = message.accepted
        this.accepted.route = pulse.route
    }
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
    trace('_receiveAccept', [ now, pulse, message, responses ])
// TODO Think hard; are will this less than catch both two-stage commit and
// Paxos?
    if (this.islandId == pulse.islandId &&
        ~pulse.governments.indexOf(this.government.promise) &&
        Monotonic.compareIndex(this.promise, message.promise, 0) <= 0
    ) {
        this.accepted = JSON.parse(JSON.stringify(message))
        this.promise = this.accepted.promise
        this.accepted.route = pulse.route
        responses.push({
            type: 'accepted',
            from: this.id,
            promise: this.promise = message.promise,
            accepted: this.accepted
        })
    } else {
        responses.push(this._reject(message))
    }
}

Legislator.prototype._receiveAccepted = function (now, pulse, message) {
    trace('_receiveAccepted', [ now, pulse, message ])
    if (~pulse.governments.indexOf(this.government.promise) && this.election) {
        assert(!~this.election.accepts.indexOf(message.from))
        this.election.accepts.push(message.from)
    }
}

// What happens if you recieve a commit message during a collapse? Currently,
// you could be sending a commit message out on the pulse of a new promise. You
// need to make sure that you don't send the commit, ah, but if you'd sent a new
// promise, you would already have worked through these things.
Legislator.prototype._receiveCommit = function (now, pulse, message, responses) {
    trace('_receiveCommit', [ now, pulse, message, responses ])
    if (this.islandId != pulse.islandId ||
        this.accepted == null ||
        this.accepted.promise != message.promise
    ) {
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
    trace('_receiveEnact', [ now, pulse, message ])

// TODO Reject? Need `===`?
    if (this.islandId != pulse.islandId) {
        return
    }

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

    if (Monotonic.isBoundary(message.promise, 0)) {
        valid = max.promise != '0/0'
        if (!valid) {
            valid = max.promise == '0/0' && message.promise == '1/0'
        }
        if (!valid) {
            valid = this.log.size == 1
            valid = valid && this.log.min().promise == '0/0'
            valid = valid && message.value.government.naturalize
            valid = valid && message.value.government.naturalize.id == this.id
            valid = valid && message.value.government.naturalize.cookie == this.cookie
            if (!valid) {
                pulse.failed = true
                return
            }
        }
    }

// TODO How crufy are these log entries? What else is lying around in them?
    max.next = message
    message.previous = max.promise
    this.log.insert(message)
    this.promise = message.promise

    if (Monotonic.isBoundary(message.promise, 0)) {
        this._enactGovernment(now, message)
    }

    this.getPeer(this.id).decided = message.promise
}

Legislator.prototype._ping = function (now) {
    assert(now != null)
    return {
        type: 'ping',
        from: this.id,
        when: now,
        decided: this._peers[this.id].decided
    }
}

Legislator.prototype._whenPulse = function (now) {
    trace('_whenPulse', [])
    this.pulse = true
}

Legislator.prototype._whenPing = function (now, id) {
    trace('_whenPing', [ now, id ])
    var peer = this.getPeer(id)
    peer.skip = false
    if (peer.timeout == 0) {
        peer.when = now
        peer.timeout = 1
    }
}

Legislator.prototype._receivePing = function (now, pulse, message, responses) {
    trace('_receivePing', [ now, pulse, message, responses ])
    if (message.from == this.id) {
        return
    }
    var peer = this.getPeer(message.from), ponged = false
    if (!peer.pinged) {
        ponged = true
    } else if (peer.timeout) {
        ponged = true
    }
    peer.timeout = 0
    peer.when = null
    peer.decided = message.decided
    peer.pinged = true
    responses.push(this._ping(now))
    var constituency = this.constituency
    if (~this.government.majority.slice(1).indexOf(this.id)) {
        constituency = this.government.minority.concat(this.government.constituents)
    }
    constituency.forEach(function (id) {
        var peer = this.getPeer(id)
        if (peer.pinged) {
            responses.push({
                type: 'ping',
                from: id,
                when: peer.when,
                decided: peer.decided
            })
        }
    }, this)
    this.ponged = this.ponged || ponged
}

Legislator.prototype._enactGovernment = function (now, round) {
    trace('_enactGovernment', [ now, round ])
    delete this.election
    this.collapsed = false

    assert(Monotonic.compare(this.government.promise, round.promise) < 0, 'governments out of order')

    // when we vote to shrink the government, the initial vote has a greater
    // quorum than the resulting government. Not sure why this comment is here.
    this.government = JSON.parse(JSON.stringify(round.value.government))
    this.locations = JSON.parse(JSON.stringify(round.value.locations))

    if (round.value.government.naturalize) {
        this.government.constituents.push(this.government.naturalize.id)
        this.locations[this.government.naturalize.id] = this.government.naturalize.location
    } else if (this.government.exile) {
        var index = this.government.constituents.indexOf(this.government.exile)
        delete this.locations[this.government.exile]
    }

    if (this.id != this.government.majority[0]) {
        this.proposals.length = 0
    }

    this.citizens = this.government.majority.concat(this.government.minority)
                                            .concat(this.government.constituents)
// TODO Decide on whether this is calculated here or as needed.
    this.parliament = this.government.majority.concat(this.government.minority)

    this.constituency = []
    if (this.parliament.length == 1) {
        if (this.id == this.government.majority[0]) {
            this.constituency = this.government.constituents.slice()
        }
    } else {
        var index = this.government.majority.slice(1).indexOf(this.id)
        if (~index) {
            var length = this.government.majority.length - 1
            this.constituency = this.government.minority.filter(function (id, i) {
                return i % length == index
            })
            assert(this.government.minority.length != 0, 'no minority')
        } else {
            var index = this.government.minority.indexOf(this.id)
            if (~index) {
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
        this.scheduler.schedule(now + this.ping, id, { object: this, type: '_whenPing' }, id)
    }, this)
}

Legislator.prototype._whenCollapse = function () {
    trace('_whenCollapse', [])
    this.collapse()
}

Legislator.prototype._expand = function () {
    trace('_expand', [])
    assert(!this.collapsed)
    var parliament = this.government.majority.concat(this.government.minority)
    if (parliament.length == this.parliamentSize) {
        return null
    }
    assert(~this.government.majority.indexOf(this.id), 'would be leader not in majority')
    var parliamentSize = parliament.length + 2
    var unknown = { timeout: 1 }
    var present = parliament.slice(1).concat(this.government.constituents).filter(function (id) {
        return (this._peers[id] || unknown).timeout == 0
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
    trace('_impeach', [])
    assert(!this.collapsed)
    var timedout = this.government.minority.filter(function (id) {
        return this._peers[id] && this._peers[id].timeout >= this.timeout
    }.bind(this)).length != 0
    if (!timedout) {
        return null
    }
    var candidates = this.government.minority.concat(this.government.constituents)
    var minority = candidates.filter(function (id) {
        return this._peers[id] && this._peers[id].timeout < this.timeout
    }.bind(this)).slice(0, this.government.minority.length)
    if (minority.length == this.government.minority.length) {
        return {
            majority: this.government.majority,
            minority: minority
        }
    }
    var parliament = this.government.majority.concat(this.government.minority)
    var parliamentSize = parliament.length <= 3 ? 1 : 3
    var unknown = { timeout: 1 }
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
    trace('_exile', [])
    assert(!this.collapsed)
    var responsive = this.government.constituents.filter(function (id) {
        return !this._peers[id] || this._peers[id].timeout < this.timeout
    }.bind(this))
    if (responsive.length == this.government.constituents.length) {
        return null
    }
    var exiles = this.government.constituents.filter(function (id) {
        return this._peers[id] && this._peers[id].timeout >= this.timeout
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
