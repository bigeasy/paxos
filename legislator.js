var assert = require('assert')
var Monotonic = require('monotonic').asString
var Scheduler = require('happenstance')
var push = [].push
var slice = [].slice
var RBTree = require('bintrees').RBTree
var signal = require('signal')

function Legislator (now, id, options) {
    assert(typeof now == 'number')

    options || (options = {})

    assert(typeof id == 'string', 'id must be hexidecimal string')

    this.id = id
    this.parliamentSize = options.parliamentSize || 5

    this.log = new RBTree(function (a, b) { return Monotonic.compare(a.promise, b.promise) })
    this.scheduler = new Scheduler
    this.synchronizing = {}

    this.proposals = []
    this.locations = {}
    this.pulse = false
    this.naturalizing = []
    this._dirty = false

    this.government = { promise: '0/0', minority: [], majority: [] }
    this.promise = '0/0'
    this.citizens = []

    this._peers = {}
    this.getPeer(this.id).timeout = 0

    this.length = options.length || 1024
    this.cookie = options.cookie || now

    assert(!Array.isArray(options.retry), 'retry no longer accepts range')
    assert(!Array.isArray(options.ping), 'retry no longer accepts range')
    assert(!Array.isArray(options.timeout), 'retry no longer accepts range')

    this.ping = options.ping || 1
    this.timeout = options.timeout || 3

    var round = {
        promise: '0/0',
        value: { government: this.government },
        quorum: [ this.id ],
        decisions: [ this.id ],
        decided: true
    }
    this.log.insert(round)

    this.constituency = []
}

Legislator.prototype._signal = function (method, vargs) {
    var subscribers = signal.subscribers([ '', 'bigeasy', 'paxos', 'invoke' ])
    for (var i = 0, I = subscribers.length; i < I; i++) {
        subscribers[i](this.id, method, vargs)
    }
}

Legislator.prototype._schedule = function (now, event) {
    assert(arguments.length == 2)
    return this.scheduler.schedule(event.id, event, now + event.delay)
}

Legislator.prototype._unschedule = function (id) {
    this._signal('_unschedule', [ id ])
    this.scheduler.unschedule(id)
}

Legislator.prototype.checkSchedule = function (now) {
    this._signal('checkSchedule', [ now ])
    var happened = false
    this.scheduler.check(now).forEach(function (event) {
        happened = true
        var type = event.type
        var method = '_when' + type[0].toUpperCase() + type.substring(1)
        this[method](now, event)
    }, this)
    return happened
}

Legislator.prototype.getPeer = function (id) {
    var peer = this._peers[id]
    if (peer == null) {
        return peer = this._peers[id] = {
            timeout: 0,
            when: null,
            cookie: null,
            decided: '0/0'
        }
    }
    return peer
}

Legislator.prototype.newGovernment = function (now, quorum, government, promise) {
    assert(arguments.length == 4)
    this._signal('newGovernment', [ now, quorum, government, promise ])
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
            government: government,
            locations: this.locations,
            map: this.proposals.map(function (proposal) {
                return { was: proposal.was, is: proposal.promise }
            })
        }
    })
}

Legislator.prototype.consensus = function (now) {
    this._signal('outbox', [ now ])
    if (this.government.majority[0] == this.id && this.accepted && Monotonic.isBoundary(this.accepted.promise, 0)) {
            return {
                type: 'consensus',
                government: this.government.promise,
                route: this.accepted.route,
                messages: [this._ping(now), {
                    type: 'commit',
                    promise: this.accepted.promise
                }]
            }
    }
    // TODO Terrible. Reset naturalizing on collapse.
    if (this.naturalizing.length && this.government.majority[0] == this.id) {
        // TODO Is there a race condition associated with leaving
        // this in place? We need to break things pretty hard in a
        // contentinous election.
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
    } else if (this.collapsed) {
        if (this.election) {
            if (this.election.promises.length < this.election.majority.length) {
                return null
            }
            this.newGovernment(now, this.election.majority, {
                majority: this.election.majority,
                minority: this.election.minority
            }, this.promise)
        } else {
            var election = this._elect()
            var parliament = this.government.majority.concat(this.government.minority)
            var unknown = { timeout: 1 }
            var present = this.parliament.filter(function (id) {
                return id != this.id && (this._peers[id] || unknown).timeout == 0
            }.bind(this))
            var majoritySize = Math.ceil(parliament.length / 2)
            if (majoritySize < present) {
                return null
            }
            var majority = [ this.id ].concat(present).slice(0, majoritySize)
            var minority = this.parliament.filter(function (id) { return ! ~majority.indexOf(id) })
            this.election = {
                majority: majority,
                minority: minority,
                promises: []
            }
            return {
                type: 'consensus',
                government: this.government.promise,
                route: majority,
                messages: [{
                    type: 'propose',
                    promise: Monotonic.increment(this.promise, 0)
                }]
            }
        }
    } else {
        if (this.ponged) {
            var reshape = this.reshape()
            if (reshape) {
                this.ponged = false
                this.newGovernment(now, reshape.quorum, reshape.government, Monotonic.increment(this.promise, 0))
            }
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
                government: this.government.promise,
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
            government: this.government.promise,
            route: proposal.route.slice(),
            messages: messages
        }
    }
    if (this.pulse) {
        this.pulse = false
        return {
            type: 'consensus',
            government: this.government.promise,
            route: this.government.majority,
            messages: [ this._ping(now) ]
        }
    }
    return null
}

Legislator.prototype.synchronize = function (now) {
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
                government: this.government.promise,
                route: [ id ],
                messages: []
            }

            var maximum = peer.decided
            if (peer.cookie != null) {
                var round
                // TODO Cookie has to come back with ping.
                if (peer.decided == '0/0') {
                    var iterator = this.log.iterator()
                    for (;;) {
                        round = iterator.prev()
                        assert(round, 'cannot find naturalization')
                        if (Monotonic.isBoundary(round.promise, 0)) {
                            var naturalize = round.value.government.naturalize
                            if (naturalize && naturalize.id == id && naturalize.cookie == peer.cookie) {
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
                        cookie: round.cookie,
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
    assert(arguments.length == 3 && now != null)
    this._signal('_receive', [ now, pulse ])
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
    this.collapsed = true
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
    this._signal('sent', [ pulse ])
    if (this.government.promise != pulse.government) {
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
    if (success) {
        switch (pulse.type) {
        case 'synchronize':
            delete this.synchronizing[pulse.route[0]]
            this._schedule(now, { type: 'ping', id: pulse.route[1], delay: this.ping })
            break
        case 'consensus':
            this._schedule(now, { type: 'pulse', id: this.id, delay: this.ping })
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
            // TODO Why can't I hit both branches at the outset.
            if (peer.when == null) {
                peer.when = now
                peer.timeout = 1
            } else {
                peer.timeout = now - peer.when
            }
            peer.skip = true
            this.ponged = true
            this._schedule(now, { type: 'ping', id: pulse.route[0], delay: this.ping })
            break
        }
    }
}

Legislator.prototype.bootstrap = function (now, location) {
    this._signal('bootstrap', [ now, location ])
    var government = {
        majority: [ this.id ],
        minority: []
    }
    this.locations[this.id] = location
    this.citizens = [ this.id ]
    this.newGovernment(now, [ this.id ], government, '1/0')
}

// Note that a client will have to treat a network failure on submission as a
// failure requiring boundary detection.
Legislator.prototype.post = function (now, message) {
    assert(arguments.length == 2)
    this._signal('post', [ now, message ])
    if (this.government.majority[0] != this.id) {
        return {
            posted: false,
            leader: this.government.majority[0]
        }
    }

    if (this.collapsed) {
        return {
            posted: false,
            leader: null
        }
    }

    switch (message.type) {
    case 'naturalize':
        this.naturalizing.push(message)
        return { posted: true, promise: null }
    case 'enqueue':
        var promise = this.promise = Monotonic.increment(this.promise, 1)
        this.proposals.push({
            promise: promise,
            route: this.government.majority,
            value: message
        })

        return {
            posted: true,
            leader: this.government.majority[0],
            promise: promise
        }
    }
}

Legislator.prototype.naturalize = function (now, id, cookie, location) {
    assert(arguments.length == 4)
    this._signal('naturalize', [ now, id ])
    assert(typeof id == 'string', 'id must be a hexidecmimal string')
    return this.post(now, { type: 'naturalize', id: id, location: location, cookie: cookie })
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

Legislator.prototype._receivePropose = function (now, pulse, message, responses) {
    this._signal('_receivePropose', [ now, pulse, message, responses ])
    var compare = Monotonic.compare(message.promise, this.promise)
    if (compare > 0) {
        responses.push({
            type: 'promise',
            from: this.id,
            promise: this.promise = message.promise,
            accepted: this.accepted
        })
    } else {
        pulse.failed = true
    }
}

Legislator.prototype._receivePromise = function (now, pulse, message, responses) {
    this._signal('_receivePromise', [ now, pulse, message, responses ])
    // TODO Add current government to messages.
    if (this.collapsed) {
        assert(!~this.election.promises.indexOf(message.from), 'duplicate promise')
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

Legislator.prototype._receiveAccept = function (now, pulse, message) {
    if (Monotonic.compareIndex(this.promise, message.promise, 0) <= 0) {
        this.accepted = JSON.parse(JSON.stringify(message))
        this.promise = this.accepted.promise
        this.accepted.route = pulse.route
    } else {
        pulse.failed = true
    }
}

// What happens if you recieve a commit message during a collapse? Currently,
// you could be sending a commit message out on the pulse of a new promise. You
// need to make sure that you don't send the commit, ah, but if you'd sent a new
// promise, you would already have worked through these things.
Legislator.prototype._receiveCommit = function (now, pulse, message) {
    this._signal('_receiveCommit', [ now, pulse, message ])

    var round = this.accepted
    this.accepted = null // TODO Move.

    if (Monotonic.compare(round.promise, message.promise) != 0) {
        throw new Error
    }

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

Legislator.prototype._receiveEnact = function (now, pulse, message) {
    this._signal('_receiveEnact', [ now, pulse, message ])

    // TODO So many assertions.
    if (this.accepted) {
        this.accepted = null
    }

    // TODO Do we need all of these?
    this.proposal = null
    this.accepted = null
    this.collapsed = false
    this.election = false

    message = JSON.parse(JSON.stringify(message))

    var max = this.log.max()

    var valid = Monotonic.compare(max.promise, message.promise) < 0

    if (!valid) {
        return
    }

    if (Monotonic.isBoundary(message.promise, 0)) {
         valid = this.log.max().promise != '0/0'
        if (!valid) {
            valid = this.log.max().promise == '0/0' && message.promise == '1/0'
        }
        if (!valid) {
            valid = this.log.size == 1
            valid = valid && this.log.min().promise == '0/0'
            valid = valid && message.value.government.naturalize
            valid = valid && message.value.government.naturalize.id == this.id
            if (!valid) {
                return
            }
        }
    }

    this.log.max().next = message
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
        when: now,
        from: this.id,
        cookie: this.cookie,
        decided: this._peers[this.id].decided
    }
}

Legislator.prototype._whenPulse = function (now, event) {
    this.pulse = true
}

Legislator.prototype._whenPing = function (now, event) {
    var peer = this.getPeer(event.id)
    peer.skip = false
    if (peer.timeout == 0) {
        peer.when = now
        peer.timeout = 1
    }
}

Legislator.prototype._receivePing = function (now, pulse, message, responses) {
    if (message.from == this.id) {
        return
    }
    var peer = this.getPeer(message.from), ponged = false
    if (peer.cookie) {
        if (peer.timeout) {
            ponged = true
        }
    } else {
        ponged = true
    }
    peer.timeout = 0
    peer.when = null
    peer.decided = message.decided
    peer.cookie = message.cookie
    responses.push(this._ping(now))
    this.ponged = this.ponged || ponged
}

Legislator.prototype._enactGovernment = function (now, round) {
    this._signal('_enactGovernment', [ round ])
    delete this.election
    this.collapsed = false

    assert(Monotonic.compare(this.government.promise, round.promise) < 0, 'governments out of order')

    // when we vote to shrink the government, the initial vote has a greater
    // quorum than the resulting government. Not sure why this comment is here.
    this.government = JSON.parse(JSON.stringify(round.value.government))
    this.locations = JSON.parse(JSON.stringify(round.value.locations))

    if (round.value.government.naturalize) {
        this.government.constituents.push(this.government.naturalize.id)
    }

    if (this.id != this.government.majority[0]) {
        this.proposals.length = 0
    }

    this.citizens = this.government.majority.concat(this.government.minority)
                                            .concat(this.government.constituents)
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
        this._schedule(now, {
            type: 'pulse',
            id: this.id,
            delay: this.ping
        })
    } else if (~this.government.majority.slice(1).indexOf(this.id)) {
        this._schedule(now, {
            type: 'collapse',
            id: this.id,
            delay: this.timeout
        })
    }

    this.constituency.forEach(function (id) {
        this._schedule(now, {
            type: 'ping',
            id: id,
            delay: this.ping
        })
    }, this)
}

Legislator.prototype._whenCollapse = function () {
    this.collapse()
}

Legislator.prototype._elect = function () {
    if (!this.collapsed) {
        return null
    }
    assert(~this.government.majority.indexOf(this.id), 'would be leader not in majority')
    var parliament = this.government.majority.concat(this.government.minority)
    var unknown = { timeout: 1 }
    var present = parliament.filter(function (id) {
        return id != this.id && (this._peers[id] || unknown).timeout == 0
    }.bind(this))
    if (present.length + 1 < this.government.majority.length) {
        return null
    }
    var parliamentSize = parliament.length <= 3 ? 1 : 3
    var newParliament = [ this.id ].concat(present).slice(0, parliamentSize)
    var majoritySize = Math.ceil(parliamentSize / 2)
    var routeLength = Math.ceil(parliament.length / 2)
    return {
        quorum: parliament.slice(0, routeLength),
        government: {
            majority: newParliament.slice(0, majoritySize),
            minority: newParliament.slice(majoritySize)
        }
    }
}

Legislator.prototype._expand = function () {
    if (this.collapsed) {
        return null
    }
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
    if (this.collapsed) {
        return null
    }
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
    if (this.collapsed) {
        return null
    }
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
            exiles: exiles
        }
    }
}

// TODO Merge all the above once it settles.
Legislator.prototype.reshape = function () {
    if (!this.collapsed && this.government.majority[0] == this.id) {
        return this._impeach() || this._exile() || this._expand()
    } else {
        return null
    }
}

module.exports = Legislator
