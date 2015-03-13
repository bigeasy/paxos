var assert = require('assert')
var Monotonic = require('monotonic')
var cadence = require('cadence')
var Scheduler = require('happenstance')
var push = [].push
var slice = [].slice
var RBTree = require('bintrees').RBTree
var Cache = require('magazine')

var Id = require('./id')

function consume (array, f, context) {
    var index = 0
    while (index < array.length) {
        if (f.call(context, array[index])) { array.splice(index, 1) }
        else { index++ }
    }
}

function Legislator (id, options) {
    options || (options = {})

    assert(typeof id == 'string', 'id must be hexidecimal string')

    this.id = id
    this.parliamentSize = options.parliamentSize || 5

    this.filter = options.filter || function (envelopes) { return [ envelopes ] }
    this.prefer = options.prefer || function () { return true }
    this.clock = options.clock || function () { return Date.now() }

    this.messageId = id + '/0'
    this.log = new RBTree(function (a, b) { return Id.compare(a.id, b.id) })
    this.length = 0
    this.scheduler = new Scheduler(this.clock)

    this.promise = { id: '0/0', quorum: [ null ] }
    this.lastPromisedId = '0/0'
    this.proposals = []
    this.routed = {}
    this.unrouted = {}
    this.location = {}

    this.government = { id: '0/0', minority: [], majority: [] }
    this.citizens = []

    this.ticks = {}
    this.retry = options.retry || 2
    this.ping = options.ping || [ 1, 1 ]
    this.timeout = options.timeout || [ 1, 1 ]
    this.failed = {}

    this.propagation()
}

Legislator.prototype.routeOf = function (path, pulse) {
    assert(typeof path != 'string', 'paths are no longer strings')
    assert(pulse != null, 'pulse must not be null')
    var id = [ pulse ? '!' : '.' ].concat(path).join(' -> '), route = this.routed[id]
    if (!route) {
        this.routed[id] = route = {
            pulse: !! pulse,
            retry: this.retry,
            sleep: this.clock(),
            id: id,
            path: path,
            envelopes: []
        }
    }
    return route
}

Legislator.prototype.greatestOf = function (id) {
    return this.greatest[id] || { learned: '0/0', decided: '0/0', uniform: '0/0' }
}

Legislator.prototype.schedule = function (event) {
    return this.scheduler.schedule({
        id: event.id,
        delay: event.delay,
        value: event
    })
}

Legislator.prototype.unschedule = function (id) {
    this.scheduler.unschedule(id)
}

Legislator.prototype.checkSchedule = function () {
    var happened = false
    this.scheduler.check().forEach(function (event) {
        happened = true
        var type = event.type
        var method = 'when' + type[0].toUpperCase() + type.substring(1)
        this[method](event)
    }, this)
    return happened
}

Legislator.prototype.consume = function (envelope, route) {
    assert(envelope.to == this.id, 'consume not self')
    var type = envelope.message.type
    var method = 'receive' + type[0].toUpperCase() + type.substring(1)
    this.filter(envelope, envelope.message).forEach(function (envelope) {
        this.ticks[envelope.from] = this.clock()
        this[method](envelope, envelope.message, route)
    }, this)
}

Legislator.prototype.stuff = function (from, to, pulse, route, message) {
    var envelopes = []
    message.id = this.messageId = Id.increment(this.messageId, 1)
    from.forEach(function (from) {
        to.forEach(function (to) {
            var envelope = {
                pulse: pulse,
                from: from,
                to: to,
                route: route,
                message: message
            }
            if (this.id == envelope.to) {
                this.consume(envelope, route)
            } else {
                envelopes.push(envelope)
            }
        }, this)
    }, this)
    return envelopes
}

Legislator.prototype.dispatch = function (options) {
    if (options.message.type !== 'failed') {
        assert(options.route, 'route is now required')
        assert(options.pulse != null, 'pulse is now required')
    }
    var route = options.route || null
    var from = options.from
    var to = options.to
    var message = options.message

    assert(typeof route != 'string')

    if (from == null) from = [ this.id ]
    if (to == null) to = route

    assert(to != null, 'to is missing')

    if (!Array.isArray(to)) to = [ to ]
    if (!Array.isArray(from)) from = [ from ]

    if (route === null) {
        this.stuff(from, to, false, null, message).forEach(function (envelope) {
            var envelopes = this.unrouted[envelope.to]
            if (!envelopes) {
                envelopes = this.unrouted[envelope.to] = []
            }
            envelopes.push(envelope)
        }, this)
    } else {
        route = this.routeOf(route, options.pulse)
        push.apply(route.envelopes, this.stuff(from, to, route.pulse, route.path, message))
    }
}

Legislator.prototype.outbox = function () {
    var routes = []

    if (this.promise.quorum[0] == this.id) {
        var route = this.routeOf(this.promise.quorum, true)
        if (route.envelopes.length && !route.sending) {
            route.sending = true
            route.retry = this.retry
            routes.push({ id: route.id, path: route.path, pulse: true })
        }
    }

    if (routes.length == 0) {
        var greatest = this.greatestOf(this.id)
        var now = this.clock()
        if (greatest.uniform == greatest.decided) {
            this.constituency.forEach(function (id) {
                var route = this.routeOf([ this.id, id ], false)
                if (!route.sending && route.retry && route.sleep <= now) {
                    if (Id.compare(this.greatestOf(id).uniform, greatest.uniform) < 0) {
                        this.dispatch({
                            pulse: false,
                            route: [ this.id, id ],
                            from: id,
                            to: this.id,
                            message: {
                                type: 'synchronize',
                                count: 20,
                                greatest: this.greatestOf(id),
                                learned: true
                            }
                        })
                    }
                }
            }, this)
        }
        for (var id in this.routed) {
            var route = this.routed[id]
            if (route.path[0] === this.id && !route.pulse) {
                if (!route.sending && route.retry && route.sleep <= now) {
                    if (route.envelopes.length === 0) {
                        delete this.routed[id]
                    } else {
                        routes.push({ id: route.id, path: route.path, pulse: false })
                        route.sending = true
                    }
                }
            }
        }
    }

    return routes
}

Legislator.prototype.sent = function (route, sent, received) {
    var pulse = route.pulse, route = this.routeOf(route.path, route.pulse), types = {}

    route.sending = false
    if (route.retry) route.retry--

    var success = false
    if (pulse || !this.failed[route.path[1]]) {
        // pongs get trapped in a prospective leader when a promise is rejected, so
        // we need to see if we're actually sending a message that expects a
        // response, or clearing out crufty pongs.
        var wasGovernment = false, expecting = false
        sent.forEach(function (envelope) {
            switch (envelope.message.type) {
                case 'prepare':
                case 'accept':
                    wasGovernment = Id.isGovernment(envelope.message.promise)
                case 'ping':
                    expecting = true
                    break
            }
        })

        if (expecting) {
            var seen = {}
            received.forEach(function (envelope) {
                seen[envelope.from] = true
            }, this)
            success = route.path.slice(1).every(function (id) { return seen[id] })
        } else {
            success = true
        }
    }

    if (success) {
        route.retry = this.retry
        route.sleep = this.clock()
        this.schedule({ type: 'ping', id: pulse ? this.id : route.path[1], delay: this.ping })
    } else {
        if (pulse) {
            delete this.log.max().working
            if (wasGovernment) {
                this.schedule({ type: 'elect', id: this.id, delay: this.timeout })
            } else {
                this.unschedule(this.id)
                this.elect()
            }
        } else {
            if (route.retry) {
                var schedule = this.schedule({ type: 'ping', id: route.path[1], delay: this.ping })
                route.sleep = schedule.when
            } else {
                this.failed[route.path[1]] = {}
            }
            if (this.election) {
                this.pinged(false, route.path[1])
            }
        }
    }
}

Legislator.prototype.forwards = function (route, index) {
    var route = this.routeOf(route.path, route.pulse)
    var envelopes = []
    consume(route.envelopes, function (envelope) {
        var i = route.path.indexOf(envelope.to)
        if (index < i) {
            envelopes.push(envelope)
            return true
        }
        return false
    })
    return envelopes
}

Legislator.prototype.returns = function (route, index) {
    var route = this.routeOf(route.path, route.pulse),
        envelopes = [],
        greatest = this.greatestOf(this.id),
        failures = greatest.decided == greatest.uniform
    route.path.slice(0, index).forEach(function (id) {
        if (failures) {
            for (var key in this.failed) {
                this.dispatch({
                    from: key,
                    to: id,
                    message: {
                        type: 'failed'
                    }
                })
            }
        }
        push.apply(envelopes, this.unrouted[id] || [])
        delete this.unrouted[id]
    }, this)
    consume(route.envelopes, function (envelope) {
        var i = route.path.indexOf(envelope.to)
        if (i < index) {
            envelopes.push(envelope)
            return true
        }
        return false
    })
    return envelopes
}

Legislator.prototype.inbox = function (route, envelopes) {
    assert(route.id != '-', 'no route id')
    var route = this.routeOf(route.path, route.pulse)
    if (route.pulse && !this.election) {
        this.schedule({ type: 'elect', id: this.id, delay: this.timeout })
    }
    envelopes.forEach(function (envelope) {
        this.dispatch({
            pulse: route.pulse,
            route: envelope.route,
            from: envelope.from,
            to: envelope.to,
            message: envelope.message
        })
    }, this)
}

Legislator.prototype.entry = function (id, message) {
    var entry = this.log.find({ id: id })
    if (!entry) {
        var entry = {
            id: id,
            accepts: [],
            learns: [],
            quorum: message.quorum
        }
        this.log.insert(entry)
    }
    ([ 'cookie', 'value', 'internal' ]).forEach(function (key) {
        if (!(key in entry) && (key in message)) {
            entry[key] = message[key]
        }
    })
    return entry
}

Legislator.prototype.bootstrap = function () {
    var entry = this.entry('0/1', {
        id: '0/1',
        value: 0,
        quorum: [ this.id ]
    })
    entry.learns = [ this.id ]
    entry.learned = true
    entry.uniform = true
    this.greatest = {}
    this.greatest[this.id] = {
        learned: '0/1',
        decided: '0/1',
        uniform: '0/1'
    }
    var government = {
        majority: [ this.id ],
        minority: []
    }
    this.citizens = [ this.id ]
    this.newGovernment([ this.id ], government)
    this.log.remove(this.log.min())
}

Legislator.prototype.extract = function (direction, count, id) {
    var most = direction == 'forward' ? 'min' : 'max'
    var next = direction == 'forward' ? 'next' : 'prev'
    var entries = [], entry, iterator, next
    id || (id = this.log[most]().id)
    iterator = this.log.findIter({ id: id })
    if (!iterator) {
        return { found: false }
    }
    entry = iterator.data(), id = entry.id
    for (entry = iterator.data(); entry; entry = iterator[next]()) {
        if (!entry.uniform) continue // not wasteful, it will be the leader that syncs
        if (Id.compare(entry.id, id, 0) != 0) break
        if (!count--) break
        entries.push({
            id: entry.id,
            quorum: entry.quorum,
            internal: entry.internal,
            value: JSON.parse(JSON.stringify(entry.value))
        })
    }
    next = entry && entry.id
    return {
        found: true,
        entries: entries,
        next: next
    }
}

Legislator.prototype.prime = function (promise) {
    var entry = this.log.find({ id: promise })
    if (entry == null) {
        return []
    } else {
        return [{
            promise: entry.id,
            previous: null,
            internal: entry.internal,
            value: entry.value
        }]
    }
}

Legislator.prototype.since = function (promise, count) {
    count = count || 24
    var iterator = this.log.findIter({ id: promise })
    if (!iterator) {
        return null
    }
    var entry, since = [], uniform = this.greatestOf(this.id).uniform, previous = promise
    while (count && (entry = iterator.next()) && Id.compare(entry.id, uniform) <= 0) {
        if (entry.uniform) {
            since.push({
                promise: entry.id,
                previous: previous,
                cookie: entry.cookie,
                internal: entry.internal,
                value: entry.value
            })
            previous = entry.id
            count--
        }
    }
    return since
}

Legislator.prototype.min = function () {
    return this.log.min().id
}

Legislator.prototype.inject = function (entries) {
    entries.forEach(function (entry) {
        this.log.insert({
            id: entry.id,
            quorum: entry.quorum.slice(),
            learns: entry.quorum.slice(),
            internal: entry.internal,
            value: entry.value,
            learned: true,
            decided: true
        })
    }, this)
}

Legislator.prototype.initialize = function () {
    var min = this.log.min()
    this.greatest = {}
    this.greatest[this.id] = {
        learned: min.id,
        decided: min.id,
        uniform: min.id
    }
    this.markUniform(min)
    assert(Id.isGovernment(min.id), 'min not government')
    this.playUniform()
    assert(this.greatestOf(this.id).uniform == this.log.max().id)
}

Legislator.prototype.immigrate = function (id) {
    this.id = id
    this.failed = {}
    this.routed = {}
    this.unrouted = {}
    this.government = { id: '0/0', minority: [], majority: [] }
}

// todo: count here by length in client

Legislator.prototype.shift = function () {
    var min = this.log.min(), max = this.log.max(), entry = min, removed = 0
    if (Id.compare(min.id, max.id, 0) == 0) {
        return removed
    }
    while (Id.compare(entry.id, min.id, 0) == 0) {
        if (entry.uniform) {
            removed++
        }
        this.log.remove(entry)
        entry = this.log.min()
    }
    if (!removed) {
        return this.shift()
    }
    this.length -= removed
    return removed
}

Legislator.prototype.nextProposalId = function (index) {
    var entry = this.log.max(), id = entry.id, proposal
    if (Id.compare(id, this.lastPromisedId) < 0) {
        id = this.lastPromisedId
    }
    return this.lastPromisedId = Id.increment(id, index)
}

Legislator.prototype.newGovernment = function (quorum, government, remap) {
    assert(!government.constituents)
    government.constituents = this.citizens.filter(function (citizen) {
        return !~government.majority.indexOf(citizen)
            && !~government.minority.indexOf(citizen)
    }).filter(function (constituent) {
        return !this.failed[constituent]
    }.bind(this))
    var iterator = this.log.findIter(this.log.max()), current = iterator.data()
    while (!current.learned) {
        current = iterator.prev()
    }
    var proposal = {
        id: this.nextProposalId(0),
        quorum: quorum,
        internal: true,
        value: {
            type: 'convene',
            government: government,
            terminus: current.id
        }
    }
    if (remap) {
        this.proposals = remap.map(function (proposal) {
            proposal.was = proposal.id
            proposal.id = this.nextProposalId(1)
            return proposal
        }.bind(this))
        proposal.value.map = remap.map(function (proposal) {
            return { was: proposal.was, is: proposal.id }
        })
    } else {
        this.proposals.length = 0
    }
    var entry = this.entry(proposal.id, proposal)
    entry.promises = []
    entry.working = true
    quorum.slice(1).forEach(function (id) {
        this.dispatch({
            pulse: true,
            route: entry.quorum,
            from: id,
            to: this.id,
            message: {
                type: 'synchronize',
                count: 20,
                greatest: this.greatestOf(id),
                learned: true // <- ?
            }
        })
        this.dispatch({
            pulse: true,
            route: entry.quorum,
            from: this.id,
            to: id,
            message: {
                type: 'synchronize',
                count: 20,
                greatest: this.greatestOf(this.id),
                learned: true
            }
        })
    }, this)
    this.prepare()
}

Legislator.prototype.propose = function (cookie, value, internal, accept) {
    var proposal = {
        id: this.nextProposalId(1),
        cookie: cookie,
        quorum: this.government.majority,
        internal: !! internal,
        value: value
    }

    if (accept) {
        this.entry(proposal.id, proposal).working = true
        this.accept()
    } else {
        this.proposals.push(proposal)
    }

    return proposal
}

Legislator.prototype.prepare = function () {
    var entry = this.log.max(), quorum = entry.quorum
    this.dispatch({
        pulse: true,
        route: quorum,
        message: {
            type: 'prepare',
            promise: entry.id,
            quorum: entry.quorum
        }
    })
}

// todo: leader is never going to aggree to a new government that was not
// proposed by itself, thus the only race is when it is the minorities, so I
// need to test the race with a five member parliament.
Legislator.prototype.receivePrepare = function (envelope, message) {
    if (Id.compare(this.greatestOf(this.id).decided, this.greatestOf(this.id).uniform) == 0) {
        var compare = Id.compare(this.promise.id, message.promise, 0)
        if (compare < 0) {
            this.promise = {
                id: message.promise,
                quorum: message.quorum
            }
            this.dispatch({
                pulse: true,
                route: envelope.route,
                to: envelope.from,
                message: {
                    type: 'promise',
                    promise: this.promise.id
                }
            })
        } else {
            this.dispatch({
                pulse: true,
                route: envelope.route,
                to: envelope.from,
                message: {
                    type: 'promised',
                    promise: this.promise.id
                }
            })
        }
    } else {
        this.dispatch({
            pulse: true,
            route: envelope.route,
            to: envelope.from,
            message: {
                type: 'promised',
                promise: this.promise.id
            }
        })
    }
}

Legislator.prototype.receivePromise = function (envelope, message) {
    var entry = this.log.max()
    assert(Id.compare(entry.id, message.promise) == 0, 'unexpected promise')
    assert(~entry.quorum.indexOf(envelope.from))
    assert(!~entry.promises.indexOf(envelope.from))
    entry.promises.push(envelope.from)
    if (entry.promises.length == entry.quorum.length) {
        this.accept()
    }
}

Legislator.prototype.receivePromised = function (envelope, message) {
    if (Id.compare(this.lastPromisedId, message.promise) < 0) {
        this.lastPromisedId = message.promise
    }
    if (Id.compare(this.greatestOf(envelope.from).uniform, this.greatestOf(this.id).uniform) == 0) {
        this.schedule({ type: 'elect', id: this.id, delay: this.timeout })
    } else {
        this.elect()
    }
}

Legislator.prototype.post = function (cookie, value, internal) {
    if (this.government.majority[0] != this.id) {
        return {
            posted: false,
            leader: this.government.majority[0]
        }
    }

    var max = this.log.max()
    if ((max.working && Id.isGovernment(max.id)) || this.election) {
        return {
            posted: false,
            leader: null
        }
    }

    var proposal = this.propose(cookie, value, internal, !max.working)

    return {
        posted: true,
        leader: this.government.majority[0],
        promise: proposal.id
    }
}

Legislator.prototype.accept = function () {
    var entry = this.log.max()
    this.dispatch({
        pulse: true,
        route: entry.quorum,
        message: {
            type: 'accept',
            internal: entry.internal,
            cookie: entry.cookie,
            quorum: entry.quorum,
            promise: entry.id,
            value: entry.value
        }
    })
}

// The accepted message must go out on the pulse, we cannot put it in the
// unrouted list and then count on it to get drawn into a pulse, because the
// leader needs to know if the message failed. The only way the leader will know
// is if the message rides a pulse. This is worth noting because I thought, "the
// only place where the pulse matters is in the leader, it does not need to be a
// property of the legislator, it can just be a property of an envelope that
// describes a route." Not so. The message should be keep with the route and it
// should only go out when that route is pulsed. If the network calls fail, the
// leader will be able to learn immediately.

Legislator.prototype.receiveAccept = function (envelope, message) {
    var compare = Id.compare(this.promise.id, message.promise, 0)
    if (compare == 0) {
        var entry = this.entry(message.promise, message)
        this.dispatch({
            pulse: true,
            route: entry.quorum,
            message: {
                type: 'accepted',
                promise: message.promise,
                quorum: entry.quorum
            }
        })
    } else {
        this.dispatch({
            pulse: true,
            route: envelope.route,
            from: envelope.from,
            to: this.id,
            message: {
                type: 'synchronize',
                count: 20,
                greatest: this.greatestOf(envelope.from)
            }
        })
        this.dispatch({
            pulse: true,
            route: envelope.route,
            to: envelope.from,
            message: {
                type: 'rejected',
                promise: message.promise
            }
        })
    }
}

Legislator.prototype.markAndSetGreatest = function (entry, type) {
    if (!entry[type]) {
        if (Id.compare(this.greatestOf(this.id)[type], entry.id) < 0) {
            this.greatestOf(this.id)[type] = entry.id
        }
        entry[type] = true
        return true
    }
    return false
}

// todo: do not learn something if the promise is less than your uniform id.
Legislator.prototype.receiveAccepted = function (envelope, message) {
    var entry = this.entry(message.promise, message)
    assert(!~entry.accepts.indexOf(envelope.from))
    assert(~entry.quorum.indexOf(this.id))
    assert(~entry.quorum.indexOf(envelope.from))
    entry.accepts.push(envelope.from)
    if (entry.accepts.length >= entry.quorum.length)  {
        this.markAndSetGreatest(entry, 'learned')
        this.dispatch({
            pulse: true,
            route: entry.quorum,
            message: {
                type: 'learned',
                promise: message.promise
            }
        })
    }
}

Legislator.prototype.receiveRejected = function (envelope, message) {
    var entry = this.entry(message.promise, message)
    assert(!~entry.accepts.indexOf(envelope.from))
    assert(~entry.quorum.indexOf(this.id))
    assert(~entry.quorum.indexOf(envelope.from))
    entry.rejects || (entry.rejects = [])
    entry.rejects.push(envelope.from)
}

Legislator.prototype.markUniform = function (entry) {
    assert(entry.learns.length > 0)
    if (this.markAndSetGreatest(entry, 'uniform')) {
        this.length++
        if (entry.internal) {
            var type = entry.value.type
            var method = 'decide' + type[0].toUpperCase() + type.slice(1)
            this[method](entry)
        }
    }
}

Legislator.prototype.playUniform = function () {
    var iterator = this.log.findIter({ id: this.greatestOf(this.id).uniform }), skip,
        previous, current, terminus

    OUTER: for (;;) {
        previous = iterator.data(), current = iterator.next()

        if (!current) {
            break
        }

        if (Id.compare(Id.increment(previous.id, 1), current.id) == 0) {
            assert(previous.uniform, 'previous must be resolved')
            if (current.decided) {
                this.markUniform(current)
                continue
            } else {
                iterator.next()
            }
        }

        terminus = iterator.data()
        for (;;) {
            if (!terminus || Id.compare(terminus.id, '0/0', 1) != 0) {
                break OUTER
            }
            if (terminus.decided) {
                break
            }
            terminus = iterator.next()
        }

        for (;;) {
            terminus = this.log.find({ id: terminus.value.terminus })
            if (!terminus) {
                break OUTER
            }
            if (Id.compare(current.id, terminus.id, 0) >= 0) {
                break
            }
        }

        assert(Id.compare(terminus.id, current.id) == 0
            || Id.compare(terminus.id, previous.id) == 0, 'terminus does not exist')

        var uniform = [ terminus = iterator.data() ]
        for (;;) {
            terminus = this.log.find({ id: terminus.value.terminus })
            uniform.push(terminus)
            if (Id.compare(current.id, terminus.id, 0) >= 0) {
                break
            }
        }

        while (uniform.length) {
            if (uniform[uniform.length - 1].learns.length == 0) {
                break OUTER
            }
            this.markUniform(uniform.pop())
        }
    }
}

Legislator.prototype.receiveLearned = function (envelope, message) {
    var entry = this.entry(message.promise, message)
    if (message.quorum && message.quorum[0] != entry.quorum[0]) {
        assert(entry.learns.length == 0, 'replace not learned')
        assert(!entry.learned, 'replace not learned')
        this.log.remove(entry)
        entry = this.entry(message.promise, message)
    }
    if (!~entry.learns.indexOf(envelope.from)) {
        entry.learns.push(envelope.from)
        if (entry.learns.length == entry.quorum.length) {
            this.markAndSetGreatest(entry, 'learned')
            this.markAndSetGreatest(entry, 'decided')
        }
        this.playUniform()
        // Shift the next entry or else send final learning pulse.
        var shift = true, max = this.log.max()
        shift = shift && !! entry.decided
        shift = shift && this.government.majority[0] == this.id
        shift = shift && !! max.working
        shift = shift && Id.compare(max.id, entry.id) <= 0
        if (shift) {
            delete max.working
            var proposal = this.proposals.shift()
            if (proposal) {
                this.entry(proposal.id, proposal).working = true
                this.accept()
            } else {
                this.nothing()
            }
        }
    }
}

// This merely asserts that a message follows a certain route. Maybe I'll
// rename it to "route", but "nothing" is good enough.
Legislator.prototype.nothing = function () {
    this.dispatch({
        pulse: true,
        route: this.promise.quorum,
        message: {
            type: 'ping',
            greatest: this.greatestOf(this.id)
        }
    })
}

Legislator.prototype.receiveSynchronize = function (envelope, message) {
    assert(message.greatest, 'message must have greatest')
    this.greatest[envelope.from] = message.greatest
    var unknown = this.greatestOf(envelope.from).learned == '0/0'
    var count = unknown ? 1 : message.count

    assert(message.from != this.id, 'synchronize with self')

    assert(message.count, 'zero count to synchronize')

    // Learned will only be sent by a majority member during re-election.
    if (message.learned &&
        this.greatestOf(this.id).learned != this.greatestOf(envelope.from).learned
    ) {
        createLearned.call(this, this.log.find({ id: this.greatestOf(this.id).learned }))
    }

    var lastUniformId = this.greatestOf(this.id).uniform
    if (lastUniformId != this.greatestOf(envelope.from).uniform) {
        createLearned.call(this, this.log.find({ id: lastUniformId }))
        count--

        var iterator = this.log.lowerBound({ id: this.greatestOf(envelope.from).uniform }), entry
        var greatest = this.greatestOf(envelope.from).uniform

        while (count-- && (entry = iterator.next()) != null && entry.id != lastUniformId) {
            // todo: test a gap.
            if (entry.uniform) {
                greatest = entry.id
                createLearned.call(this, entry)
            }
        }
    }

    this.dispatch({
        pulse: envelope.pulse,
        route: envelope.route,
        to: envelope.from,
        message: {
            type: 'ping',
            greatest: this.greatestOf(this.id)
        }
    })

    function createLearned (entry) {
        this.dispatch({
            pulse: envelope.pulse,
            route: envelope.route,
            from: entry.learns,
            to: envelope.from,
            message: {
                type: 'learned',
                promise: entry.id,
                quorum: entry.quorum,
                cookie: entry.cookie,
                value: entry.value,
                internal: entry.internal
            }
        })
    }
}

Legislator.prototype.whenPing = function (event) {
    if (this.government.majority[0] == this.id && event.id == this.id) {
        this.nothing()
    } else if (~this.constituency.indexOf(event.id)) {
        this.dispatch({
            pulse: false,
            route: [ this.id, event.id ],
            to: event.id,
            message: {
                type: 'ping',
                greatest: this.greatestOf(this.id)
            }
        })
    }
}

Legislator.prototype.receivePing = function (envelope, message) {
    this.greatest[envelope.from] = message.greatest
    this.dispatch({
        pulse: envelope.pulse,
        route: envelope.route,
        to: envelope.from,
        message: {
            type: 'pong',
            greatest: this.greatestOf(this.id)
        }
    })
}

Legislator.prototype.receiveFailed = function (envelope, message) {
    if (!~this.citizens.indexOf(envelope.from)) {
        return
    }

    if (this.id != envelope.from) {
        this.routeOf([ this.id, envelope.from ], true).retry = 0
        this.routeOf([ this.id, envelope.from ], false).retry = 0
    }

    var failed = this.failed[envelope.from]

    if (!failed) {
        failed = this.failed[envelope.from] = {}
    }

    if (this.government.majority[0] == this.id) {
        var election = false
        election = election || !! this.election

        var max = this.log.max()
        election = election || max.working && Id.isGovernment(max.id)

        var promise = failed.election || '0/0'
        var uniform = this.greatestOf(this.id).uniform
        election = election || Id.compare(promise, uniform) >= 0

        if (!election) {
            var leader = this.id
            if (this.id == envelope.from) {
                assert(this.government.majority.length > 1, 'single leader cannot succeed')
                leader = this.government.majority[1]
                this.dispatch({
                    pulse: true,
                    route: this.government.majority,
                    from: this.id,
                    to: leader,
                    message: { type: 'failed' }
                })
            }
            this.failed[envelope.from].election = this.reelection(leader).promise
        }
    }
}

Legislator.prototype.receivePong = function (envelope, message, route) {
    this.greatest[envelope.from] = message.greatest
    var impossible = Id.compare(this.log.min().id, message.greatest.uniform) > 0
    if (impossible) {
        this.dispatch({
            from: envelope.from,
            to: this.id,
            message: { type: 'failed' }
        })
    }
    this.pinged(!impossible, envelope.from)
}

Legislator.prototype.pinged = function (reachable, from) {
    var election = this.election, parliament, quorum, minority, majority
    if (election && !~election.receipts.indexOf(from)) {
        election.receipts.push(from)
        var group = this.prefer(from) ? election.preferred : election.ordinary
        var index = group.quorum.sought.indexOf(from)
        if (~index) {
            group.quorum.sought.splice(index, 1)
            var seen = group.quorum.seen
        } else {
            var seen = group.constituents
        }
        if (reachable) {
            seen.push(from)
            election.reachable++
            group.sought--
        }
        var quorum = {}
        quorum.preferred = election.preferred.quorum.seen.length == election.quorumSize - 1
        quorum.ordinary = election.preferred.quorum.seen.length +
                          election.ordinary.quorum.seen.length >= election.quorumSize - 1
        if (quorum.preferred) {
            election.preferred.quorum.sought.length = 0
        } else if (election.preferred.quorum.sought.length == 0) {
            quorum.preferred = true
        }
        var parliament = {}
        parliament.preferred = quorum.preferred &&
                              (election.preferred.constituents.length >= election.minoritySize ||
                               election.preferred.sought == 0)
        parliament.ordinary = quorum.ordinary && election.reachable >= election.parliamentSize
        var complete = election.requests == election.receipts.length
        if ((parliament.preferred && parliament.ordinary) || (quorum.ordinary && complete)) {
            var prefer = function (a, b) {
                a = this.prefer(a) ? 0 : 1
                b = this.prefer(b) ? 0 : 1
                return a - b
            }.bind(this)
            var candidates = election.preferred.quorum.seen.concat(election.ordinary.quorum.seen)
                                                           .concat(election.preferred.constituents)
                                                           .concat(election.ordinary.constituents)
            for (var i = 0; election.quorum.length < election.quorumSize; i++) {
                election.quorum.push(candidates.shift())
            }
            candidates = election.quorum.concat(candidates.sort(prefer))
            if (election.reachable < election.parliamentSize) {
                // if we have the quorum, but we do not have the parliament, we
                // form a government of quorum size, shrink the government.
                election.parliamentSize -= 2
                election.majoritySize = Math.ceil(election.parliamentSize / 2)
                election.minoritySize = election.parliamentSize - election.majoritySize
                while (election.majority.length < election.majoritySize) {
                    election.majority.push(candidates.shift())
                }
                while (election.minority.length < election.minoritySize) {
                    election.minority.push(candidates.shift())
                }
            } else {
                while (election.majority.length < election.majoritySize) {
                    var candidate = candidates.shift()
                    election.majority.push(candidate)
                    if (election.quorum.length < election.majority.length) {
                        election.quorum.push(candidate)
                    }
                }
                while (election.minority.length < election.minoritySize) {
                    election.minority.push(candidates.shift())
                }
            }
            delete this.election
            this.newGovernment(election.quorum, {
                majority: election.majority,
                minority: election.minority
            }, election.remap)
        } else if (complete) {
            delete this.election
            this.schedule({ type: 'elect', id: this.id, delay: this.timeout })
        }
    }
}

Legislator.prototype.emigrate = function (id) {
    this.dispatch({
        from: id,
        to: this.id,
        message: {
            type: 'failed',
            value: {}
        }
    })
}

Legislator.prototype.propagation = function () {
    this.citizens = this.government.majority.concat(this.government.minority)
                                            .concat(this.government.constituents)
    this.parliament = this.government.majority.concat(this.government.minority)

    for (var failed in this.failed) {
        if (!~this.citizens.indexOf(failed)) {
            delete this.location[failed]
            delete this.unrouted[failed]
            for (var id in this.routed) {
                var route = this.routed[id]
                if (~route.path.indexOf(failed)) {
                    delete this.routed[id]
                }
            }
            delete this.failed[failed]
        }
    }

    this.constituency = []
    if (this.parliament.length == 1) {
        this.constituency = this.government.constituents.slice()
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
    if (~this.government.majority.indexOf(this.id)) {
        if (this.government.majority[0] == this.id) {
            if (!this.prefer(this.id) && this.government.majority.some(this.prefer)) {
                this.schedule({
                    type: 'defer',
                    id: '!',
                    delay: this.timeout
                })
            } else {
                var preferred = {
                    parliament: this.parliament.filter(this.prefer).length,
                    citizens: this.citizens.filter(this.prefer).length
                }
                if (
                    preferred.parliament < this.parliamentSize &&
                    preferred.citizens > preferred.parliament
                ) {
                    this.schedule({
                        type: 'elect',
                        id: '!',
                        delay: this.timeout
                    })
                }
            }
            this.schedule({
                type: 'ping',
                id: this.id,
                delay: this.ping
            })
        } else {
            this.schedule({
                type: 'elect',
                id: this.id,
                delay: this.timeout
            })
        }
    }
    this.constituency.forEach(function (id) {
        var route = this.routeOf([ this.id, id ], false)
        var event = this.schedule({
            type: 'ping',
            id: id,
            delay: this.ping
        })
        route.sleep = this.clock()
        route.retry = this.retry
    }, this)
}

Legislator.prototype.decideConvene = function (entry) {
    delete this.election

    var min = this.log.min()
    var terminus = this.log.find({ id: entry.value.terminus })

    assert(min.id == entry.id || (terminus && terminus.learns.length > 0))
    assert(Id.compare(this.government.id, entry.id) < 0, 'governments out of order')

    // when we vote to shrink the government, the initial vote has a greater
    // quorum than the resulting government.
    this.promise.quorum = entry.value.government.majority

    this.government = entry.value.government
    this.government.id = entry.id

    if (this.id != this.government.majority[0]) {
        this.proposals.length = 0
    }

    this.propagation()
}

Legislator.prototype.naturalize = function (id) {
    assert(typeof id == 'string', 'id must be a hexidecmimal string')
    return this.post(null, { type: 'naturalize', id: id }, true)
}

Legislator.prototype.decideNaturalize = function (entry) {
    if (!~this.citizens.indexOf(entry.value.id)) {
        this.government.constituents.push(entry.value.id)
    }
    this.propagation()
    if (entry.value.id == this.id) {
        this.naturalized = entry.id
    }
    this.location[entry.value.id] = entry.value.location
    var elect, now = this.clock()
    elect = this.government.majority[0] == this.id
    elect = elect && this.parliament.length < this.maxParliamentSize(this.candidates(now).length + 1)
    if (elect) {
        this.elect(true)
    }
}

Legislator.prototype.maxParliamentSize = function (citizens) {
    var parliamentSize = Math.min(citizens, this.parliamentSize)
    if (parliamentSize % 2 == 0) {
        parliamentSize--
    }
    return parliamentSize
}

Legislator.prototype.whenElect = function () {
    this.elect()
}

Legislator.prototype.whenDefer = function () {
    if (this.government.majority[0] === this.id) {
        var successor = this.government.majority.filter(this.prefer).shift()
        assert(successor, 'poorly choosen successor')
        this.schedule({ type: 'elect', id: '!', delay: this.timeout })
        this.reelection(successor)
    }
}

Legislator.prototype.reachable = function (now) {
    assert(now != null, 'now is requried to reachable')
    return this.citizens.filter(function (citizen) {
        var route = this.routeOf([ this.id, citizen ], false)
        return route.retry && route.sleep <= now
    }.bind(this))
}

Legislator.prototype.candidates = function (now) {
    return this.reachable(now).filter(function (id) {
        return id != this.id && id != this.government.majority[0]
    }.bind(this))
}

Legislator.prototype.elect = function (remap) {
    if (this.election) {
        return
    }
    if (!~this.government.majority.indexOf(this.id)) {
        return
    }
    var now = this.clock()
    var candidates = this.candidates(now)
    var receipts = this.citizens.filter(function (citizen) {
        return !~candidates.indexOf(citizen)
    }.bind(this))
    var remap = remap && this.proposals.splice(0, this.proposals.length)
    var parliamentSize = this.maxParliamentSize(candidates.length + 1)
    var majoritySize = Math.ceil(parliamentSize / 2)
    var minoritySize = parliamentSize - majoritySize
    var quorum = this.parliament.filter(function (citizen) {
        return ~candidates.indexOf(citizen)
    }, this)
    var constituents = candidates.filter(function (citizen) {
        return !~quorum.indexOf(citizen)
    })
    var preferred = {
        quorum: {
            sought: quorum.filter(function (citizen) {
                return this.prefer(citizen)
            }, this),
            seen: []
        },
        sought: candidates.filter(function (citizen) {
            return this.prefer(citizen)
        }, this).length,
        constituents: []
    }
    var ordinary = {
        quorum: {
            sought: quorum.filter(function (citizen) {
                return !this.prefer(citizen)
            }, this),
            seen: []
        },
        sought: constituents.filter(function (citizen) {
            return !this.prefer(citizen)
        }, this).length,
        constituents: []
    }
    this.election = {
        remap: remap,
        parliamentSize: parliamentSize,
        quorum: [ this.id ],
        quorumSize: this.government.majority.length,
        majority: [],
        majoritySize: majoritySize,
        minority: [],
        minoritySize: minoritySize,
        reachable: [],
        receipts: receipts,
        preferred: preferred,
        ordinary: ordinary,
        requests: receipts.length + candidates.length,
        parliament: [],
        constituents: [],
        reachable: 1
    }
    candidates.forEach(function (id) {
        this.dispatch({
            pulse: false,
            route: [ this.id, id ],
            to: id,
            message: {
                type: 'ping',
                greatest: this.greatestOf(this.id)
            }
        })
    }, this)
}

Legislator.prototype.reelection = function (id) {
    return this.post(null, { type: 'election', id: id || this.id }, true)
}

Legislator.prototype.decideElection = function (entry) {
    var greatest = this.greatestOf(this.id)
    if (entry.value.id == this.id) {
        if (~this.government.majority.indexOf(this.id)) {
            this.elect(true)
        }
    }
}

module.exports = Legislator
