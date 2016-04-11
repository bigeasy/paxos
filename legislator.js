var assert = require('assert')
var Monotonic = require('monotonic').asString
var Scheduler = require('happenstance')
var push = [].push
var slice = [].slice
var RBTree = require('bintrees').RBTree
var signal = require('signal')

function consume (array, f, context) {
    var index = 0
    while (index < array.length) {
        if (f.call(context, array[index])) { array.splice(index, 1) }
        else { index++ }
    }
}

function Legislator (now, id, options) {
    assert(typeof now == 'number')

    options || (options = {})

    assert(typeof id == 'string', 'id must be hexidecimal string')

    this.id = id
    this.parliamentSize = options.parliamentSize || 5
    this._Date = options.Date || Date

    this.messageId = id + '/0'
    this.log = new RBTree(function (a, b) { return Monotonic.compare(a.promise, b.promise) })
    this.length = 0
    this.scheduler = new Scheduler

    this.proposals = []
    this.routed = {}
    this.unrouted = {}
    this.locations = {}
    this._greatest = {}
    this.naturalizing = []

    this.government = { promise: '0/0', minority: [], majority: [] }
    this.promise = '0/0'
    this.citizens = []

    assert(!Array.isArray(options.retry), 'retry no longer accepts range')
    assert(!Array.isArray(options.ping), 'retry no longer accepts range')
    assert(!Array.isArray(options.timeout), 'retry no longer accepts range')

    this.ticks = {}
    this.retry = options.retry || 2
    this.ping = options.ping || 1
    this.timeout = options.timeout || 1
    this.failed = {}

    var round = {
        promise: '0/0',
        value: this.government,
        quorum: [ this.id ],
        decisions: [ this.id ],
        decided: true,
        enacted: true
    }
    this.log.insert(round)

    this._propagation(now)
}

Legislator.prototype._signal = function (method, vargs) {
    var subscribers = signal.subscribers([ '', 'bigeasy', 'paxos', 'invoke' ])
    for (var i = 0, I = subscribers.length; i < I; i++) {
        subscribers[i](this.id, method, vargs)
    }
}

Legislator.prototype.routeOf = function (now, path, pulse) {
    assert(arguments.length == 3)
    this._signal('routeOf', [ path, pulse ])
    assert(typeof path != 'string', 'paths are no longer strings')
    assert(pulse != null, 'pulse must not be null')
    var id = [ pulse ? '!' : '.' ].concat(path).join(' -> '), route = this.routed[id]
    if (!route) {
        this.routed[id] = route = {
            pulse: !! pulse,
            retry: this.retry,
            sleep: now,
            id: id,
            path: path,
            envelopes: []
        }
    }
    return route
}

Legislator.prototype.getGreatest = function (id, value) {
    if (!this._greatest[id] || value) {
        this._greatest[id] = value || { decided: '0/0', enacted: '0/0' }
    }
    return this._greatest[id]
}

// TODO To make replayable, we need to create a scheduler that accepts a now so
// that the caller can replay the schedule, this should probably be the default.
Legislator.prototype._schedule = function (now, event) {
    assert(arguments.length == 2)
    var when = now + event.delay
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
    var happened = false
    this.scheduler.check(now).forEach(function (event) {
        happened = true
        var type = event.type
        var method = '_when' + type[0].toUpperCase() + type.substring(1)
        this[method](event)
    }, this)
    return happened
}

Legislator.prototype._consume = function (now, envelope, route) {
    assert(arguments.length == 3 && now != null)
    this._signal('_consume', [ envelope, route ])
    assert(envelope.to == this.id, 'consume not self')
    var type = envelope.message.type
    var method = '_receive' + type[0].toUpperCase() + type.substring(1)
    this.ticks[envelope.from] = now
    this[method](now, envelope, envelope.message, route)
}

Legislator.prototype._stuff = function (now, from, to, pulse, route, message) {
    assert(arguments.length == 6 && now != null)
    var envelopes = []
    message.id = this.messageId = Monotonic.increment(this.messageId, 1)
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
                this._consume(now, envelope, route)
            } else {
                envelopes.push(envelope)
            }
        }, this)
    }, this)
    this._signal('_stuff', [ envelopes ])
    return envelopes
}

Legislator.prototype._dispatch = function (now, options) {
    assert(arguments.length == 2 && now != null)
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
        route = this.routeOf(now, route, options.pulse)
        push.apply(route.envelopes, this._stuff(now, from, to, route.pulse, route.path, message))
    }
}

Legislator.prototype.__defineGetter__('now',  function (now) {
    throw new Error
})

Legislator.prototype.outbox = function (now) {
    this._signal('outbox', [ now ])

    var routes = []

    if (this.government.majority[0] == this.id) {
        var route = this.routeOf(now, this.government.majority, true)
        if (route.envelopes.length && !route.sending) {
            route.sending = true
            route.retry = this.retry
            routes.push({ id: route.id, path: route.path, pulse: true })
        }
    }

    if (routes.length == 0) {
        var greatest = this.getGreatest(this.id)
        this.constituency.forEach(function (id) {
            var route = this.routeOf(now, [ this.id, id ], false)
            if (!route.sending && route.retry && route.sleep <= now) {
                if (Monotonic.compare(this.getGreatest(id).decided, greatest.decided) < 0) {
                    this._synchronize(now, [ this.id, id ], false, id, 20)
                }
            }
        }, this)
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
    var pulse = route.pulse, route = this.routeOf(now, route.path, route.pulse), types = {}

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
                    wasGovernment = Monotonic.isBoundary(envelope.message.promise, 0)
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
        route.sleep = now
        this.visited = now
        this._schedule(now, { type: 'ping', id: pulse ? this.id : route.path[1], delay: this.ping })
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
    var route = this.routeOf(now, route.path, route.pulse)
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
    var route = this.routeOf(now, route.path, route.pulse),
        envelopes = [],
        greatest = this.getGreatest(this.id),
        failures = greatest.enacted == greatest.uniform
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
    var route = this.routeOf(now, route.path, route.pulse)
    if (route.pulse && !this.election) {
        this._schedule(now, { type: 'elect', id: this.id, delay: this.timeout })
    }
    envelopes.forEach(function (envelope) {
        this._signal('envelope', [ envelope ])
        this._dispatch(now, {
            pulse: route.pulse,
            route: envelope.route,
            from: envelope.from,
            to: envelope.to,
            message: envelope.message
        })
    }, this)
}

Legislator.prototype.bootstrap = function (now, location) {
    this._signal('bootstrap', [ now, location ])
    this.now = now
    var government = {
        majority: [ this.id ],
        minority: []
    }
    this.locations[this.id] = location
    this.citizens = [ this.id ]
    this.newGovernment(now, [ this.id ], government, false)
    this.log.remove(this.log.min())
}

Legislator.prototype.min = function () {
    this._signal('min', [])
    return this.log.min().id
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
    if (Monotonic.compareIndex(min.id, max.id, 0) == 0) {
        return removed
    }
    while (Monotonic.compareIndex(entry.id, min.id, 0) == 0) {
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

Legislator.prototype.newGovernment = function (now, quorum, government, remap) {
    assert(arguments.length == 4)
    // TODO Need a copy government befor sharing it in this way.
    this._signal('newGovernment', [ quorum, government, remap ])
    assert(!government.constituents)
    government.constituents = this.citizens.filter(function (citizen) {
        return !~government.majority.indexOf(citizen)
            && !~government.minority.indexOf(citizen)
    }).filter(function (constituent) {
        return !this.failed[constituent]
    }.bind(this))
    if (government.naturalize) {
        government.constituents.push(government.naturalize.id)
    }
    // No mercy. If it was not decided, it never happened.
    var max = this.log.max()
    while (!max.decided) {
        this.log.remove(max)
        max = this.log.max()
        assert(max.enacted)
    }
    var promise = government.promise = this.promise = Monotonic.increment(this.promise, 0)
    var map = []
    if (remap) {
        this.proposals = this.proposals.splice(0, this.proposals.length).map(function (proposal) {
            proposal.was = proposal.promise
            proposal.promise = this.promise = Monotonic.increment(this.promise, 1)
            return proposal
        }.bind(this))
        map = this.proposals.map(function (proposal) {
            return { was: proposal.was, is: proposal.promise }
        })
    } else {
        this.proposals.length = 0
    }
    var proposal = {
        type: 'propose',
        promise: promise,
        quorum: quorum,
        acceptances: [],
        decisions: [],
        cookie: null,
        internal: true,
        value: {
            type: 'convene',
            government: government,
            terminus: JSON.parse(JSON.stringify(max)),
            locations: this.locations,
            map: map
        }
    }
    quorum.slice(1).forEach(function (id) {
        this._synchronize(entry.quorum, true, id, 20)
    }, this)
    this.proposals.unshift(proposal)
    this._propose(now)
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
    if ((!max.decided && Monotonic.isBoundary(max.id, 0)) || this.election) {
        return {
            posted: false,
            leader: null
        }
    }

    var proposal = {
        type: 'propose',
        promise: this.promise = Monotonic.increment(this.promise, 1),
        quorum: this.government.majority,
        acceptances: [],
        decisions: [],
        cookie: cookie,
        internal: internal,
        value: value,
        working: true
    }

    this.proposals.push(proposal)

    // TODO What is the best way to know if the ball is rolling?
    if (max.enacted) {
        this._propose(now)
    }

    return {
        posted: true,
        leader: this.government.majority[0],
        promise: proposal.id
    }
}

Legislator.prototype._propose = function (now) {
    this._signal('_propose', [])
    var proposal = this.proposals.shift()
    this._dispatch(now, {
        pulse: true,
        route: proposal.quorum,
        message: proposal
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

Legislator.prototype._receivePropose = function (now, envelope, message) {
    // fetch an interator to inspect the last two entries in the log
    var iterator = this.log.iterator()
    var max = iterator.prev()

    var accepted = false

    // if not already proposed by someone else, and greater than or inside the
    // current government...
    var round = this.log.find({ promise: message.promise })
    var compare = Monotonic.compareIndex(max.promise, message.promise, 0)
    if (!round && compare <= 0) {
        accepted = true
        if (compare < 0) {
            // select the last decided entry in the log
            var decided = max.decided ? max : iterator.prev()
            var terminus = message.value.terminus
            // the terminus must be in the previous government
            accepted = Monotonic.compareIndex(terminus.promise, decided.promise, 0) == 0
            accepted = accepted || message.value.government.naturalize.id == this.id
            if (accepted) {
                // remove the top of the log if it is undecided, we're replacing it.
                if (!max.decided) {
                    this.log.remove(max)
                }
            }
        }
    }
    if (accepted) {
        this.log.insert(message)
        this._dispatch(now, {
            pulse: true,
            route: message.quorum,
            message: {
                type: 'accepted',
                promise: message.promise,
                quorum: message.quorum
            }
        })
    } else {
        throw new Error
        assert(typeof envelope.from == 'string')
        assert(!Array.isArray(envelope.from))
        this._synchronize(envelope.route, true, envelope.from, 20) // TODO outgoing
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

// TODO Do not learn something if the promise is less than your uniform id.
Legislator.prototype._receiveAccepted = function (now, envelope, message) {
    assert(now != null)
    var round = this.log.find({ promise: message.promise })
    assert(!~round.acceptances.indexOf(envelope.from))
    // assert(~round.quorum.indexOf(this.id))
    assert(~round.quorum.indexOf(envelope.from))
    round.acceptances.push(envelope.from)
    if (round.acceptances.length >= round.quorum.length)  {
        this.getGreatest(this.id).decided = round.promise
        round.decided = true
        this._dispatch(now, {
            pulse: true,
            route: round.quorum,
            message: {
                type: 'decided',
                promise: round.promise
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

Legislator.prototype._receiveDecided = function (now, envelope, message) {
    this._signal('_receiveDecided', [ envelope, message ])
    var iterator = this.log.iterator()
    var round = iterator.prev()
    if (Monotonic.compare(round.promise, message.promise) == 0 &&
        !~round.decisions.indexOf(envelope.from)
    ) {
        round.decisions.push(envelope.from)
        if (round.decisions.length == round.quorum.length) {
            iterator.prev().next = round
            round.enacted = true
            this.getGreatest(this.id).enacted = round.promise
            // possibly do some work
            this._enact(now, round)
            if (this.government.majority[0] == this.id) {
                if (this.naturalizing.length) {
                    // TODO Is there a race condition associated with leaving
                    // this in place? We need to break things pretty hard in a
                    // contentinous election.
                    var round = this.naturalizing[0]
                    this.newGovernment(now, this.government.majority, {
                        majority: this.government.majority,
                        minority: this.government.minority,
                        naturalize: { id: round.value.id, location: round.value.location }
                    }, true)
                } else if (this.proposals.length) {
                    this._propose(now)
                } else {
                    this._nothing(now)
                }
            }
        }
    }
    // what was this about?
    // var round = this.log.find({ promise: message.promise })
    // if (message.quorum && message.quorum[0] != round.quorum[0]) {
    //    assert(entry.decisions.length == 0, 'replace not decided')
    //    assert(!entry.decided, 'replace not decided')
    //    this.log.remove(entry)
    //    entry = this._entry(message.promise, message)
    // }
}

// This merely asserts that a message follows a certain route. Maybe I'll
// rename it to "route", but "nothing" is good enough.
Legislator.prototype._nothing = function (now) {
    this._signal('_nothing', [ now ])
    this._dispatch(now, {
        pulse: true,
        route: this.government.majority,
        message: {
            type: 'ping',
            greatest: this.getGreatest(this.id)
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

// TODO Allow messages to land prior to being primed. No! Assert that this never
// happens.
Legislator.prototype._synchronize = function (now, route, pulse, to, count) {
    var maximum = this.getGreatest(to).enacted
    var unknown = maximum == '0/0'

    var round
    if (unknown) {
        round = this.log.min()
        assert(Monotonic.compareIndex(round.promise, '0/0', 1) == 0, 'minimum not a government')
        for (;;) {
            var naturalize = round.value.government.naturalize
            if (naturalize && naturalize.id == to) {
                maximum = round.promise
                break
            }
            round = round.nextGovernment
            assert(round, 'cannot find naturalization')
        }
    }

    assert(count, 'zero count to synchronize')

    round = this.log.find({ promise: maximum })

    while (--count && round) {
        this._replicate(now, pulse, route, to, round)
        round = round.next
    }

    // Decided will only be sent by a majority member during re-election. There
    // will always be zero or one decided rounds in addition to the existing
    // rounds.
    if (pulse && this._greatestOf(this.id).decided != this._greatestOf(to).decided) {
        this._replicate(now, pulse, route, to, this.log.find({ id: this._greatestOf(this.id).decided }))
    }

    this._dispatch(now, {
        pulse: pulse,
        route: route,
        to: to,
        message: {
            type: 'ping',
            greatest: this.getGreatest(this.id)
        }
    })
}

Legislator.prototype._replicate = function (now, pulse, route, to, round) {
    this._dispatch(now, {
        pulse: pulse,
        route: route,
        from: round.quorum[0],
        to: to,
        message: {
            type: 'propose',
            promise: round.promise,
            quorum: round.quorum,
            acceptances: [],
            decisions: [],
            cookie: round.cookie,
            internal: round.internal,
            value: round.value
        }
    })
    this._dispatch(now, {
        pulse: pulse,
        route: route,
        from: round.acceptances,
        to: to,
        message: {
            type: 'accepted',
            promise: round.promise,
            quorum: round.quorum
        }
    })
    this._dispatch(now, {
        pulse: pulse,
        route: route,
        from: round.acceptances,
        to: to,
        message: {
            type: 'decided',
            promise: round.promise,
            quorum: round.quorum
        }
    })
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

Legislator.prototype._receivePing = function (now, envelope, message) {
    this.getGreatest(envelope.from, message.greatest)
    this._dispatch(now, {
        pulse: envelope.pulse,
        route: envelope.route,
        to: envelope.from,
        message: {
            type: 'pong',
            greatest: this.getGreatest(this.id)
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
        election = election || max.working && Monotonic.isBoundary(max.id, 0)

        var promise = failed.election || '0/0'
        var uniform = this._greatestOf(this.id).uniform
        election = election || Monotonic.compare(promise, uniform) >= 0

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
Legislator.prototype._receivePong = function (now, envelope, message, route) {
    this.getGreatest(envelope.from, message.greatest)
    var impossible = Monotonic.compare(this.log.min().promise, message.greatest.enacted) > 0
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

Legislator.prototype._propagation = function (now) {
    assert(arguments.length == 1)
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
                this._schedule(now, {
                    type: 'elect',
                    id: '!',
                    delay: this.timeout
                })
            }
            this._schedule(now, {
                type: 'ping',
                id: this.id,
                delay: this.ping
            })
        } else {
            this._schedule(now, {
                type: 'elect',
                id: this.id,
                delay: this.timeout
            })
        }
    }
    this.constituency.forEach(function (id) {
        var route = this.routeOf(now, [ this.id, id ], false)
        var event = this._schedule(now, {
            type: 'ping',
            id: id,
            delay: this.ping
        })
        route.sleep = now
        route.retry = this.retry
    }, this)
}

Legislator.prototype._enact = function (now, round) {
    if (round.internal) {
        var type = round.value.type
        var method = '_enact' + type[0].toUpperCase() + type.slice(1)
        this[method](now, round)
    }
}

Legislator.prototype._enactConvene = function (now, round) {
    this._signal('_enactConvene', [ round ])
    delete this.election

    var min = this.log.min()
    var terminus = this.log.find({ promise: round.value.terminus.promise })
    if (!terminus) {
        this.log.insert(terminus = round.value.terminus)
    }
    if (!terminus.enacted) {
        terminus.enacted = true
        this._enact(now, terminus)
    }

    var previous = Monotonic.toWords(terminus.promise)
    if (round.value.government.naturalize) {
        if (this.naturalizing.length == 0 && round.value.government.naturalize.id == this.id) {
            this.naturalizing.unshift({ value: { id: this.id } })
            previous = Monotonic.toWords('0/0')
        }
        assert(this.naturalizing.shift().value.id == round.value.government.naturalize.id)
    }
    previous[1] = [ 0 ]
    this.log.find({ promise: Monotonic.toString(previous) }).nextGovernment = round

    assert(Monotonic.compare(this.government.promise, round.promise) < 0, 'governments out of order')

    // when we vote to shrink the government, the initial vote has a greater
    // quorum than the resulting government. Not sure why this comment is here.
    // TODO Deep copy.
    this.government = JSON.parse(JSON.stringify(round.value.government))
    this.locations = JSON.parse(JSON.stringify(round.value.locations))

    if (this.id != this.government.majority[0]) {
        this.proposals.length = 0
    }

    this._propagation(now)
}

Legislator.prototype.naturalize = function (now, id, location) {
    this._signal('naturalize', [ now, id ])
    assert(typeof id == 'string', 'id must be a hexidecmimal string')
    return this.post(now, null, { type: 'naturalize', id: id, location: location }, true)
}

Legislator.prototype._enactNaturalize = function (now, round) {
    this.naturalizing.push(round)
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

Legislator.prototype._enactElection = function (entry) {
    if (entry.value.id == this.id) {
        if (~this.government.majority.indexOf(this.id)) {
            this._elect(true)
        }
    }
}

module.exports = Legislator
