var assert = require('assert')
var Monotonic = require('monotonic')
var Scheduler = require('happenstance')
var push = [].push
var slice = [].slice
var RBTree = require('bintrees').RBTree
var signal = require('signal')

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

    this.now = Infinity

    assert(typeof id == 'string', 'id must be hexidecimal string')

    this.id = id
    this.parliamentSize = options.parliamentSize || 5
    this._Date = options.Date || Date

    this.messageId = id + '/0'
    this.log = new RBTree(function (a, b) { return Id.compare(a.id, b.id) })
    this.length = 0
    this.scheduler = new Scheduler

    this.promise = { id: '0/0', quorum: [ null ] }
    this.lastPromisedId = '0/0'
    this.proposals = []
    this.routed = {}
    this.unrouted = {}
    this.locations = {}

    this.government = { id: '0/0', minority: [], majority: [] }
    this.citizens = []


    assert(!Array.isArray(options.retry), 'retry no longer accepts range')
    assert(!Array.isArray(options.ping), 'retry no longer accepts range')
    assert(!Array.isArray(options.timeout), 'retry no longer accepts range')

    this.ticks = {}
    this.retry = options.retry || 2
    this.ping = options.ping || 1
    this.timeout = options.timeout || 1
    this.failed = {}

    this._propagation()
}

Legislator.prototype._signal = function (method, vargs) {
    var subscribers = signal.subscribers([ '', 'bigeasy', 'paxos', 'invoke' ])
    for (var i = 0, I = subscribers.length; i < I; i++) {
        subscribers[i](this.id, method, vargs)
    }
}

Legislator.prototype.routeOf = function (path, pulse) {
    this._signal('routeOf', [ path, pulse ])
    assert(typeof path != 'string', 'paths are no longer strings')
    assert(pulse != null, 'pulse must not be null')
    var id = [ pulse ? '!' : '.' ].concat(path).join(' -> '), route = this.routed[id]
    if (!route) {
        this.routed[id] = route = {
            pulse: !! pulse,
            retry: this.retry,
            sleep: this.now,
            id: id,
            path: path,
            envelopes: []
        }
    }
    return route
}

Legislator.prototype._greatestOf = function (id) {
    return this.greatest[id] || { learned: '0/0', decided: '0/0', uniform: '0/0' }
}

// TODO To make replayable, we need to create a scheduler that accepts a now so
// that the caller can replay the schedule, this should probably be the default.
Legislator.prototype._schedule = function (event) {
    var when = this.now + event.delay
    return this._actualSchedule(event.id, event, when)
}

Legislator.prototype._actualSchedule = function (key, value, when) {
    this._signal('_actualSchedule', [ key, value, when ])
    return this.scheduler.schedule(key, value, when)
}

Legislator.prototype._unschedule = function (id) {
    this._signal('_unschedule', [ id ])
    this.scheduler.unschedule(id)
}

Legislator.prototype.checkSchedule = function (now) {
    this._signal('checkSchedule', [ now ])
    this.now = now
    var happened = false
    this.scheduler.check(this.now).forEach(function (event) {
        happened = true
        var type = event.type
        var method = '_when' + type[0].toUpperCase() + type.substring(1)
        this[method](event)
    }, this)
    return happened
}

Legislator.prototype._consume = function (envelope, route) {
    this._signal('_consume', [ envelope, route ])
    assert(envelope.to == this.id, 'consume not self')
    var type = envelope.message.type
    var method = '_receive' + type[0].toUpperCase() + type.substring(1)
    this.ticks[envelope.from] = this.now
    this[method](envelope, envelope.message, route)
}

Legislator.prototype._stuff = function (from, to, pulse, route, message) {
    var envelopes = []
    message.id = this.messageId = Id.increment(this.messageId, 1)
    this._signal('_stuff', [ from, to, pulse, route, message ])
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
                this._consume(envelope, route)
            } else {
                envelopes.push(envelope)
            }
        }, this)
    }, this)
    this._signal('_stuff', [ envelopes ])
    return envelopes
}

Legislator.prototype._dispatch = function (options) {
//    if (options.message.id == '0/95') throw new Error
    this._signal('_dispatch', [ options ])
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
        this._stuff(from, to, false, null, message).forEach(function (envelope) {
            var envelopes = this.unrouted[envelope.to]
            if (!envelopes) {
                envelopes = this.unrouted[envelope.to] = []
            }
            envelopes.push(envelope)
        }, this)
    } else {
        route = this.routeOf(route, options.pulse)
        push.apply(route.envelopes, this._stuff(from, to, route.pulse, route.path, message))
    }
}

Legislator.prototype.outbox = function (now) {
    this._signal('outbox', [ now ])

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
        var greatest = this._greatestOf(this.id)
        var now = this.now
        if (greatest.uniform == greatest.decided) {
            this.constituency.forEach(function (id) {
                var route = this.routeOf([ this.id, id ], false)
                if (!route.sending && route.retry && route.sleep <= now) {
                    if (Id.compare(this._greatestOf(id).uniform, greatest.uniform) < 0) {
                        this._dispatch({
                            pulse: false,
                            route: [ this.id, id ],
                            from: id,
                            to: this.id,
                            message: {
                                type: 'synchronize',
                                count: 20,
                                greatest: this._greatestOf(id),
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

    this._signal('outbox', [ routes ])

    return routes
}

Legislator.prototype.sent = function (now, route, sent, received) {
    this._signal('sent', [ now, route, sent, received ])
    this.now = now
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
        route.sleep = this.now
        this.visited = this.now
        this._schedule({ type: 'ping', id: pulse ? this.id : route.path[1], delay: this.ping })
    } else {
        if (pulse) {
            delete this.log.max().working
            if (wasGovernment) {
                this._schedule({ type: 'elect', id: this.id, delay: this.timeout })
            } else {
                this._unschedule(this.id)
                this._elect()
            }
        } else {
            if (route.retry) {
                var schedule = this._schedule({ type: 'ping', id: route.path[1], delay: this.ping })
                route.sleep = schedule.when
            } else {
                this.failed[route.path[1]] = {}
            }
            if (this.election) {
                this._pinged(false, route.path[1])
            }
        }
    }
}

Legislator.prototype.forwards = function (now, route, index) {
    this._signal('forwards', [ now, route, index ])
    this.now = now
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
    this._signal('forwards', [ envelopes ])
    return envelopes
}

Legislator.prototype.returns = function (now, route, index) {
    this._signal('returns', [ now, route, index ])
    this.now = now
    var route = this.routeOf(route.path, route.pulse),
        envelopes = [],
        greatest = this._greatestOf(this.id),
        failures = greatest.decided == greatest.uniform
    route.path.slice(0, index).forEach(function (id) {
        if (failures) {
            for (var key in this.failed) {
                this._dispatch({
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
    this._signal('returns', [ envelopes ])
    return envelopes
}

Legislator.prototype.inbox = function (now, route, envelopes) {
    this._signal('inbox', [ now, route, envelopes ])
    envelopes.forEach(function (envelope) {
        this._signal('envelope', [ envelope ])
    }, this)
    assert(route.id != '-', 'no route id')
    this.now = now
    this.visited = now
    var route = this.routeOf(route.path, route.pulse)
    if (route.pulse && !this.election) {
        this._schedule({ type: 'elect', id: this.id, delay: this.timeout })
    }
    envelopes.forEach(function (envelope) {
        this._signal('envelope', [ envelope ])
        this._dispatch({
            pulse: route.pulse,
            route: envelope.route,
            from: envelope.from,
            to: envelope.to,
            message: envelope.message
        })
    }, this)
}

Legislator.prototype._entry = function (id, message) {
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

Legislator.prototype.bootstrap = function (now, location) {
    this._signal('bootstrap', [ now, location ])
    this.now = now
    var entry = this._entry('0/1', {
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
    this.locations[this.id] = location
    this.citizens = [ this.id ]
    this.newGovernment([ this.id ], government)
    this.log.remove(this.log.min())
}

Legislator.prototype.extract = function (direction, count, id) {
    this._signal('extract', [ direction, count, id ])
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
    this._signal('prime', [ promise ])
    var entry = this.log.find({ id: promise })
    if (entry == null) {
        return []
    } else {
        return [{
            // TODO Why sometimes promise, sometimes id?
            promise: entry.id,
            previous: null,
            internal: entry.internal,
            value: entry.value
        }]
    }
}

Legislator.prototype.since = function (promise, count) {
    this._signal('since', [ promise ])
    count = count || 24
    var iterator = this.log.findIter({ id: promise })
    if (!iterator) {
        return null
    }
    var entry, since = [], uniform = this._greatestOf(this.id).uniform, previous = promise
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
    this._signal('min', [])
    return this.log.min().id
}

Legislator.prototype.inject = function (entries) {
    this._signal('inject', [ entries ])
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

Legislator.prototype.initialize = function (now) {
    this._signal('initialize', [ now ])
    this.now = now
    var min = this.log.min()
    this.greatest = {}
    this.greatest[this.id] = {
        learned: min.id,
        decided: min.id,
        uniform: min.id
    }
    this._markUniform(min)
    assert(Id.isGovernment(min.id), 'min not government')
    this._playUniform()
    assert(this._greatestOf(this.id).uniform == this.log.max().id)
}

Legislator.prototype.immigrate = function (id) {
    this._signal('immigrate', [ id ])
    this.id = id
    this.failed = {}
    this.routed = {}
    this.unrouted = {}
    this.government = { id: '0/0', minority: [], majority: [] }
}

// TODO Count here by length in client.

Legislator.prototype.shift = function () {
    this._signal('shift', [])
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

Legislator.prototype._nextProposalId = function (index) {
    var entry = this.log.max(), id = entry.id, proposal
    if (Id.compare(id, this.lastPromisedId) < 0) {
        id = this.lastPromisedId
    }
    return this.lastPromisedId = Id.increment(id, index)
}

Legislator.prototype.newGovernment = function (quorum, government, remap) {
    // TODO Need a copy government befor sharing it in this way.
    this._signal('newGovernment', [ quorum, government, remap ])
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
        id: this._nextProposalId(0),
        quorum: quorum,
        internal: true,
        value: {
            type: 'convene',
            government: government,
            terminus: current.id,
            locations: this.locations
        }
    }
    if (remap) {
        this.proposals = remap.map(function (proposal) {
            proposal.was = proposal.id
            proposal.id = this._nextProposalId(1)
            return proposal
        }.bind(this))
        proposal.value.map = remap.map(function (proposal) {
            return { was: proposal.was, is: proposal.id }
        })
    } else {
        this.proposals.length = 0
    }
    var entry = this._entry(proposal.id, proposal)
    entry.promises = []
    entry.working = true
    quorum.slice(1).forEach(function (id) {
        this._dispatch({
            pulse: true,
            route: entry.quorum,
            from: id,
            to: this.id,
            message: {
                type: 'synchronize',
                count: 20,
                greatest: this._greatestOf(id),
                learned: true // <- ?
            }
        })
        this._dispatch({
            pulse: true,
            route: entry.quorum,
            from: this.id,
            to: id,
            message: {
                type: 'synchronize',
                count: 20,
                greatest: this._greatestOf(this.id),
                learned: true
            }
        })
    }, this)
    this._prepare()
}

Legislator.prototype._propose = function (cookie, value, internal, accept) {
    var proposal = {
        id: this._nextProposalId(1),
        cookie: cookie,
        quorum: this.government.majority,
        internal: !! internal,
        value: value
    }

    if (accept) {
        this._entry(proposal.id, proposal).working = true
        this._accept()
    } else {
        this.proposals.push(proposal)
    }

    return proposal
}

Legislator.prototype._prepare = function () {
    var entry = this.log.max(), quorum = entry.quorum
    this._dispatch({
        pulse: true,
        route: quorum,
        message: {
            type: 'prepare',
            promise: entry.id,
            quorum: entry.quorum
        }
    })
}

// TODO leader is never going to aggree to a new government that was not
// proposed by itself, thus the only race is when it is the minorities, so I
// need to test the race with a five member parliament.
Legislator.prototype._receivePrepare = function (envelope, message) {
    if (Id.compare(this._greatestOf(this.id).decided, this._greatestOf(this.id).uniform) == 0) {
        var compare = Id.compare(this.promise.id, message.promise, 0)
        if (compare < 0) {
            this.promise = {
                id: message.promise,
                quorum: message.quorum
            }
            this._dispatch({
                pulse: true,
                route: envelope.route,
                to: envelope.from,
                message: {
                    type: 'promise',
                    promise: this.promise.id
                }
            })
        } else {
            this._dispatch({
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
        this._dispatch({
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

Legislator.prototype._receivePromise = function (envelope, message) {
    var entry = this.log.max()
    assert(Id.compare(entry.id, message.promise) == 0, 'unexpected promise')
    assert(~entry.quorum.indexOf(envelope.from))
    assert(!~entry.promises.indexOf(envelope.from))
    entry.promises.push(envelope.from)
    if (entry.promises.length == entry.quorum.length) {
        this._accept()
    }
}

Legislator.prototype._receivePromised = function (envelope, message) {
    if (Id.compare(this.lastPromisedId, message.promise) < 0) {
        this.lastPromisedId = message.promise
    }
    if (Id.compare(this._greatestOf(envelope.from).uniform, this._greatestOf(this.id).uniform) == 0) {
        this._schedule({ type: 'elect', id: this.id, delay: this.timeout })
    } else {
        this._elect()
    }
}

Legislator.prototype.post = function (now, cookie, value, internal) {
    this._signal('post', [ now, cookie, value, internal ])
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

    var proposal = this._propose(cookie, value, internal, !max.working)

    return {
        posted: true,
        leader: this.government.majority[0],
        promise: proposal.id
    }
}

Legislator.prototype._accept = function () {
    this._signal('_accept', [])
    var entry = this.log.max()
    this._dispatch({
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
// describes a route." Not so. The message should be kept with the route and it
// should only go out when that route is pulsed. If the network calls fail, the
// leader will be able to learn immediately.

Legislator.prototype._receiveAccept = function (envelope, message) {
    var compare = Id.compare(this.promise.id, message.promise, 0)
    if (compare == 0) {
        var entry = this._entry(message.promise, message)
        this._dispatch({
            pulse: true,
            route: entry.quorum,
            message: {
                type: 'accepted',
                promise: message.promise,
                quorum: entry.quorum
            }
        })
    } else {
        this._dispatch({
            pulse: true,
            route: envelope.route,
            from: envelope.from,
            to: this.id,
            message: {
                type: 'synchronize',
                count: 20,
                greatest: this._greatestOf(envelope.from)
            }
        })
        this._dispatch({
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

Legislator.prototype._markAndSetGreatest = function (entry, type) {
    if (!entry[type]) {
        if (Id.compare(this._greatestOf(this.id)[type], entry.id) < 0) {
            this._greatestOf(this.id)[type] = entry.id
        }
        entry[type] = true
        return true
    }
    return false
}

// TODO Do not learn something if the promise is less than your uniform id.
Legislator.prototype._receiveAccepted = function (envelope, message) {
    var entry = this._entry(message.promise, message)
    assert(!~entry.accepts.indexOf(envelope.from))
    assert(~entry.quorum.indexOf(this.id))
    assert(~entry.quorum.indexOf(envelope.from))
    entry.accepts.push(envelope.from)
    if (entry.accepts.length >= entry.quorum.length)  {
        this._markAndSetGreatest(entry, 'learned')
        this._dispatch({
            pulse: true,
            route: entry.quorum,
            message: {
                type: 'learned',
                promise: message.promise
            }
        })
    }
}

Legislator.prototype._receiveRejected = function (envelope, message) {
    var entry = this._entry(message.promise, message)
    assert(!~entry.accepts.indexOf(envelope.from))
    assert(~entry.quorum.indexOf(this.id))
    assert(~entry.quorum.indexOf(envelope.from))
    entry.rejects || (entry.rejects = [])
    entry.rejects.push(envelope.from)
}

Legislator.prototype._markUniform = function (entry) {
    assert(entry.learns.length > 0)
    if (this._markAndSetGreatest(entry, 'uniform')) {
        this.length++
        if (entry.internal) {
            var type = entry.value.type
            var method = '_decide' + type[0].toUpperCase() + type.slice(1)
            this[method](entry)
        }
    }
}

Legislator.prototype._playUniform = function () {
    var iterator = this.log.findIter({ id: this._greatestOf(this.id).uniform }), skip,
        previous, current, terminus

    OUTER: for (;;) {
        previous = iterator.data(), current = iterator.next()

        if (!current) {
            break
        }

        if (Id.compare(Id.increment(previous.id, 1), current.id) == 0) {
            assert(previous.uniform, 'previous must be resolved')
            if (current.decided) {
                this._markUniform(current)
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
            this._markUniform(uniform.pop())
        }
    }
}

Legislator.prototype._receiveLearned = function (envelope, message) {
    this._signal('_receiveLearned', [ envelope, message ])
    var entry = this._entry(message.promise, message)
    if (message.quorum && message.quorum[0] != entry.quorum[0]) {
        assert(entry.learns.length == 0, 'replace not learned')
        assert(!entry.learned, 'replace not learned')
        this.log.remove(entry)
        entry = this._entry(message.promise, message)
    }
    if (!~entry.learns.indexOf(envelope.from)) {
        entry.learns.push(envelope.from)
        if (entry.learns.length == entry.quorum.length) {
            this._markAndSetGreatest(entry, 'learned')
            this._markAndSetGreatest(entry, 'decided')
        }
        this._playUniform()
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
                this._entry(proposal.id, proposal).working = true
                this._accept()
            } else {
                this._nothing()
            }
        }
    }
}

// This merely asserts that a message follows a certain route. Maybe I'll
// rename it to "route", but "nothing" is good enough.
Legislator.prototype._nothing = function () {
    this._signal('_nothing', [])
    this._dispatch({
        pulse: true,
        route: this.promise.quorum,
        message: {
            type: 'ping',
            greatest: this._greatestOf(this.id)
        }
    })
}

// This is a message because it rides the pulse. When a new government is
// created, the new leader adds `"synchronize"` messages to the `"prepare"`
// messages. It is opportune to have the leader signal that the new majority
// needs to synchronize amongst themselves and have that knowledge ride the
// initial pulse that runs a full round of Paxos.
//
// This is is noteworthy because you've come back to this code, looked at how
// the message is used to synchronize constituents and thought that it was a
// waste to tigger these actions through dispatch. You then look at how the
// messages are sent during the pulse and wonder why those messages can't simply
// be added by a function call, but the pulse is telling all the members of the
// majority to synchronize among themselves.
//
// However, it is always going to be the case that when we are reelecting we're
// going to synchronize from the new leader. The new leader is going to be a
// member of the previous majority. They are going to have the latest
// information. And, actually, we can always check when we see a route if the
// members on that route are at the same level of uniformity as us.
Legislator.prototype._receiveSynchronize = function (envelope, message) {
    assert(message.greatest, 'message must have greatest')
    this.greatest[envelope.from] = message.greatest
    var unknown = this._greatestOf(envelope.from).learned == '0/0'
    var count = unknown ? 1 : message.count

    assert(message.from != this.id, 'synchronize with self')

    assert(message.count, 'zero count to synchronize')

    // Learned will only be sent by a majority member during re-election.
    if (message.learned &&
        this._greatestOf(this.id).learned != this._greatestOf(envelope.from).learned
    ) {
        createLearned.call(this, this.log.find({ id: this._greatestOf(this.id).learned }))
    }

    var lastUniformId = this._greatestOf(this.id).uniform
    if (lastUniformId != this._greatestOf(envelope.from).uniform) {
        createLearned.call(this, this.log.find({ id: lastUniformId }))
        count--

        var iterator = this.log.lowerBound({ id: this._greatestOf(envelope.from).uniform }), entry
        var greatest = this._greatestOf(envelope.from).uniform

        while (count-- && (entry = iterator.next()) != null && entry.id != lastUniformId) {
            // TODO Test a gap.
            if (entry.uniform) {
                greatest = entry.id
                createLearned.call(this, entry)
            }
        }
    }

    this._dispatch({
        pulse: envelope.pulse,
        route: envelope.route,
        to: envelope.from,
        message: {
            type: 'ping',
            greatest: this._greatestOf(this.id)
        }
    })

    function createLearned (entry) {
        this._dispatch({
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

Legislator.prototype._whenPing = function (event) {
    if (this.government.majority[0] == this.id && event.id == this.id) {
        this._nothing()
    } else if (~this.constituency.indexOf(event.id)) {
        this._dispatch({
            pulse: false,
            route: [ this.id, event.id ],
            to: event.id,
            message: {
                type: 'ping',
                greatest: this._greatestOf(this.id)
            }
        })
    }
}

Legislator.prototype._receivePing = function (envelope, message) {
    this.greatest[envelope.from] = message.greatest
    this._dispatch({
        pulse: envelope.pulse,
        route: envelope.route,
        to: envelope.from,
        message: {
            type: 'pong',
            greatest: this._greatestOf(this.id)
        }
    })
}

Legislator.prototype._receiveFailed = function (envelope, message) {
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
        var uniform = this._greatestOf(this.id).uniform
        election = election || Id.compare(promise, uniform) >= 0

        if (!election) {
            var leader = this.id
            if (this.id == envelope.from) {
                assert(this.government.majority.length > 1, 'single leader cannot succeed')
                leader = this.government.majority[1]
                this._dispatch({
                    pulse: true,
                    route: this.government.majority,
                    from: this.id,
                    to: leader,
                    message: { type: 'failed' }
                })
            }
            this.failed[envelope.from].election = this.reelection(this.now, leader).promise
        }
    }
}

// TODO What was the gap that made it impossible?
Legislator.prototype._receivePong = function (envelope, message, route) {
    this.greatest[envelope.from] = message.greatest
    var impossible = Id.compare(this.log.min().id, message.greatest.uniform) > 0
    if (impossible) {
        this._dispatch({
            from: envelope.from,
            to: this.id,
            message: { type: 'failed' }
        })
    }
    this._pinged(!impossible, envelope.from)
}

Legislator.prototype._pinged = function (reachable, from) {
    this._signal('_pinged', [ reachable, from ])

    // Pings are done via HTTP/S so they are definitive. The response here
    // includes whether or not they are reachable, whether or not there was a
    // 200 response. Complete means that all pings where attempted and reachable
    // is the count of pings that responded.

    var election = this.election, parliament, quorum, minority, majority
    if (election && !~election.receipts.indexOf(from)) {
        election.receipts.push(from)
        var index = election.incumbent.quorum.sought.indexOf(from)
        if (~index) {
            election.incumbent.quorum.sought.splice(index, 1)
            var seen = election.incumbent.quorum.seen
        } else {
            var seen = election.incumbent.constituents
        }
        if (reachable) {
            seen.push(from)
            election.reachable++
            election.incumbent.sought--
        }
        quorum = election.incumbent.quorum.seen.length == election.quorumSize - 1
        if (quorum) {
            election.incumbent.quorum.sought.length = 0
        }

        var parliament = quorum && election.reachable == election.parliamentSize
        var complete = election.requests == election.receipts.length

        // form on quorum size, so we will never shrink below quorum, never go
        // from parliament size two to one.

        if (parliament || (quorum && complete)) {
            var candidates = election.incumbent.quorum.seen.concat(election.incumbent.constituents)

            // we've primed the election quorum with ourselves as leader.
            for (var i = 0; election.quorum.length < election.quorumSize; i++) {
                election.quorum.push(candidates.shift())
            }

            // we now have incumbents up top, followed by whomever.
            candidates = election.quorum.concat(candidates)

            // do we have enough citizens for a full parliament?
            if (election.reachable < election.parliamentSize) {
                // if we have the quorum, but we do not have the parliament, we
                // form a government of quorum size, shrink the government.
                // TODO Come back and convince myself that we won't shrink below
                // size of two.
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
                // with a quorum of incumbants up top, build a majority.
                while (election.majority.length < election.majoritySize) {
                    var candidate = candidates.shift()
                    election.majority.push(candidate)
                    if (election.quorum.length < election.majority.length) {
                        election.quorum.push(candidate)
                    }
                }
                // fill in the minority with any whomever.
                while (election.minority.length < election.minoritySize) {
                    election.minority.push(candidates.shift())
                }
            }

            // election complete.
            delete this.election

            // propose the new governent.
            this.newGovernment(election.quorum, {
                majority: election.majority,
                minority: election.minority
            }, election.remap)
        } else if (complete) {
            delete this.election
            this._schedule({ type: 'elect', id: this.id, delay: this.timeout })
        }
    }
}

Legislator.prototype.emigrate = function (now, id) {
    this._signal('emigrate', [ now, id ])
    assert(this._Date.now() == now, 'now is wrong')
    this.now = now
    this._dispatch({
        from: id,
        to: this.id,
        message: {
            type: 'failed',
            value: {}
        }
    })
}

Legislator.prototype._propagation = function () {
    this.citizens = this.government.majority.concat(this.government.minority)
                                            .concat(this.government.constituents)
    this.parliament = this.government.majority.concat(this.government.minority)

    for (var failed in this.failed) {
        if (!~this.citizens.indexOf(failed)) {
            delete this.locations[failed]
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
            if (
                this.parliament.length < this.parliamentSize &&
                this.citizens.length > this.parliament.length
            ) {
                this._schedule({
                    type: 'elect',
                    id: '!',
                    delay: this.timeout
                })
            }
            this._schedule({
                type: 'ping',
                id: this.id,
                delay: this.ping
            })
        } else {
            this._schedule({
                type: 'elect',
                id: this.id,
                delay: this.timeout
            })
        }
    }
    this.constituency.forEach(function (id) {
        var route = this.routeOf([ this.id, id ], false)
        var event = this._schedule({
            type: 'ping',
            id: id,
            delay: this.ping
        })
        route.sleep = this.now
        route.retry = this.retry
    }, this)
}

Legislator.prototype._decideConvene = function (entry) {
    this._signal('_decideConvene', [ entry ])
    delete this.election

    var min = this.log.min()
    var terminus = this.log.find({ id: entry.value.terminus })

    assert(min.id == entry.id || (terminus && terminus.learns.length > 0))
    assert(Id.compare(this.government.id, entry.id) < 0, 'governments out of order')

    // when we vote to shrink the government, the initial vote has a greater
    // quorum than the resulting government.
    this.promise.quorum = entry.value.government.majority

    // TODO Deep copy.
    this.government = JSON.parse(JSON.stringify(entry.value.government))
    this.government.id = entry.id
    this.locations = JSON.parse(JSON.stringify(entry.value.locations))

    if (this.id != this.government.majority[0]) {
        this.proposals.length = 0
    }

    this._propagation()
}

Legislator.prototype.naturalize = function (now, id, location) {
    this._signal('naturalize', [ now, id ])
    assert(typeof id == 'string', 'id must be a hexidecmimal string')
    return this.post(now, null, { type: 'naturalize', id: id, location: location }, true)
}

Legislator.prototype._decideNaturalize = function (entry) {
    // TODO You need to naturalize the same id twice, I believe, to test this
    // branch as a negative, but perhaps it is an assertion.
    if (!~this.citizens.indexOf(entry.value.id)) {
        this.government.constituents.push(entry.value.id)
    }
    this._propagation()
    if (entry.value.id == this.id) {
        this.naturalized = entry.id
    }
    this.locations[entry.value.id] = entry.value.location
    var elect, now = this.now
    elect = this.government.majority[0] == this.id
    elect = elect && this.parliament.length < this._maxParliamentSize(this._candidates(now).length + 1)
    if (elect) {
        this._elect(true)
    }
}

Legislator.prototype._maxParliamentSize = function (citizens) {
    var parliamentSize = Math.min(citizens, this.parliamentSize)
    if (parliamentSize % 2 == 0) {
        parliamentSize--
    }
    return parliamentSize
}

Legislator.prototype._whenElect = function () {
    this._elect()
}

Legislator.prototype._reachable = function (now) {
    assert(now != null, 'now is requried to reachable')
    return this.citizens.filter(function (citizen) {
        var route = this.routeOf([ this.id, citizen ], false)
        return route.retry && route.sleep <= now
    }.bind(this))
}

Legislator.prototype._candidates = function (now) {
    return this._reachable(now).filter(function (id) {
        return id != this.id && id != this.government.majority[0]
    }.bind(this))
}

Legislator.prototype.elect = function (now) {
    this._signal('elect', [ now ])
    this.now = now
    this._elect()
}

Legislator.prototype._elect = function (remap) {
    this._signal('_elect', [ remap ])
    if (this.election) {
        return
    }
    if (!~this.government.majority.indexOf(this.id)) {
        return
    }
    var now = this.now
    var candidates = this._candidates(now)
    var receipts = this.citizens.filter(function (citizen) {
        return !~candidates.indexOf(citizen)
    }.bind(this))
    var remap = remap && this.proposals.splice(0, this.proposals.length)
    var parliamentSize = this._maxParliamentSize(candidates.length + 1)
    var majoritySize = Math.ceil(parliamentSize / 2)
    var minoritySize = parliamentSize - majoritySize
    var quorum = this.parliament.filter(function (citizen) {
        return ~candidates.indexOf(citizen)
    }, this)
    var constituents = candidates.filter(function (citizen) {
        return !~quorum.indexOf(citizen)
    })
    var incumbent = {
        quorum: {
            sought: quorum.slice(),
            seen: []
        },
        sought: candidates.length,
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
        incumbent: incumbent,
        requests: receipts.length + candidates.length,
        parliament: [],
        constituents: [],
        reachable: 1
    }
    candidates.forEach(function (id) {
        this._dispatch({
            pulse: false,
            route: [ this.id, id ],
            to: id,
            message: {
                type: 'ping',
                greatest: this._greatestOf(this.id)
            }
        })
    }, this)
}

Legislator.prototype.reelection = function (now, id) {
    return this.post(now, null, { type: 'election', id: id || this.id }, true)
}

Legislator.prototype._decideElection = function (entry) {
    if (entry.value.id == this.id) {
        if (~this.government.majority.indexOf(this.id)) {
            this._elect(true)
        }
    }
}

module.exports = Legislator
