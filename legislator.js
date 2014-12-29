var assert = require('assert')
var Monotonic = require('monotonic')
var cadence = require('cadence')
var push = [].push
var slice = [].slice
var RBTree = require('bintrees').RBTree;
var Cache = require('magazine')

var consume = require('./consume')

var Id = {
    toWords: function (id) {
        var split = id.split('/')
        return [ Monotonic.parse(split[0]), Monotonic.parse(split[1]) ]
    },
    toString: function (id) {
        return Monotonic.toString(id[0]) + '/' + Monotonic.toString(id[1])
    },
    compare: function (a, b, index) {
        a = Id.toWords(a)
        b = Id.toWords(b)
        if (index == null) {
            var compare = Monotonic.compare(a[0], b[0])
            if (compare == 0) {
                return Monotonic.compare(a[1], b[1])
            }
            return compare
        }
        return Monotonic.compare(a[index], b[index])
    },
    increment: function (id, index) {
        id = Id.toWords(id)
        var next = [ id[0], id[1] ]
        next[index] = Monotonic.increment(next[index])
        if (index == 0) {
            next[1] = [ 0 ]
        }
        return Id.toString(next)
    },
    isGovernment: function (record) {
        return Id.compare('0/0', record.id, 1) == 0
    }
}

function Legislator (id, options) {

    options || (options = {})

    assert(typeof id == 'string', 'id must be hexidecimal string')

    this.id = id
    this.clock = options.clock || function () { return Date.now() }
    this.messageId = id + '/0'
    this.idealGovernmentSize = options.size || 5
    this.log = new RBTree(function (a, b) { return Id.compare(a.id, b.id) })
    this.government = { id: '0/0', minority: [], majority: [] }
    this.greatest = {}
    this.lastPromisedId = '0/0'
    this.proposals = []
    this.citizens = {}
    this._routed = {}
    this.unrouted = {}
    this.greatest[id] = {
        learned: '0/1',
        decided: '0/1',
        uniform: '0/1'
    }
    this.filter = options.filter || function (envelopes) { return [ envelopes ] }
    this.ticks = {}
    this.timeout = options.timeout || 5000
    this.promise = { id: '0/0', quorum: [] }
    this.retry = 2
    this.sleep = 1

    var entry = this.entry('0/1', {
        id: '0/1',
        value: 0,
        quorum: [ id ]
    })
    entry.learns = [ id ]
    entry.learned = true
    entry.decided = true
    entry.uniform = true

    this.propagation()
}

Legislator.prototype.routeOf = function (path) {
    if (typeof path == 'string') {
        path = path.split(' -> ')
    }
    var id = path.join(' -> '), route = this._routed[id]
    if (!route) {
        this._routed[id] = route = {
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

Legislator.prototype.consume = function (envelope) {
    assert(envelope.to == this.id, 'consume not self')
    var type = envelope.message.type
    var method = 'receive' + type[0].toUpperCase() + type.substring(1)
    this.filter(envelope, envelope.message).forEach(function (envelope) {
        this.ticks[envelope.from] = this.clock()
        this[method](envelope, envelope.message)
    }, this)
}

Legislator.prototype.stuff = function (from, to, route, message) {
    var envelopes = []
    message.id = this.messageId = Id.increment(this.messageId, 1)
    from.forEach(function (from) {
        to.forEach(function (to) {
            var envelope = {
                from: from,
                to: to,
                route: route,
                message: message
            }
            if (this.id == envelope.to) {
                this.consume(envelope)
            } else {
                envelopes.push(envelope)
            }
        }, this)
    }, this)
    return envelopes
}

Legislator.prototype.dispatch = function (options) {
    var route = options.route || '-'
    var from = options.from
    var to = options.to
    var message = options.message

    if (from == null) from = [ this.id ]
    if (to == null) to = route

    assert(to != '-', 'to is missing')

    if (!Array.isArray(to)) to = [ to ]
    if (!Array.isArray(from)) from = [ from ]

    if (route == '-') {
        this.stuff(from, to, '-', message).forEach(function (envelope) {
            var envelopes = this.unrouted[envelope.to]
            if (!envelopes) {
                envelopes = this.unrouted[envelope.to] = []
            }
            envelopes.push(envelope)
        }, this)
    } else {
        route = this.routeOf(route)
        push.apply(route.envelopes, this.stuff(from, to, route.id, message))
    }
}

Legislator.prototype.outbox = function () {
    var routes = []

    if (this.promise.quorum[0] == this.id) {
        var route = this.routeOf(this.promise.quorum)
        if (route.envelopes.length && !route.sending && route.retry && route.sleep <= this.clock()) {
            route.sending = true
            route.retry = this.retry
            routes.push({ id: route.id, path: route.path })
        }
    }

    this.constituency.forEach(function (id) {
        if (Id.compare(this.greatestOf(id).uniform, this.greatestOf(this.id).uniform) < 0) {
            var route = this.routeOf([ this.id, id ])
            if (!route.sending && route.retry && route.sleep <= this.clock()) {
                route.sending = true
                route.retry = this.retry
                this.dispatch({
                    from: id,
                    to: this.id,
                    message: {
                        type: 'synchronize',
                        count: 20,
                        greatest: this.greatestOf(id),
                        learned: true
                    }
                })
                routes.push(route)
            }
        }
    }, this)

    return routes
}

Legislator.prototype.sent = function (route, sent, received) {
    var route = this.routeOf(route.path), types = {}
    route.sending = false
    route.retry--
    received.forEach(function (envelope) {
        types[envelope.message.type] = true
    })
    var completed = false
    sent.forEach(function (envelope) {
        switch (envelope.message.type) {
        case 'ping':
            completed = types.pong
            break
        case 'prepare':
            completed = types.promise || types.promised
            break
        case 'accept':
            completed = types.accepted || types.rejected
            break
        case 'nothing':
            completed = true
            break
        }
    })
    if (completed) {
        route.retry = this.retry
        route.sleep = this.clock()
    } else {
        route.sleep = this.clock() + this.sleep
    }
}

Legislator.prototype.forwards = function (path, index) {
    var route = this.routeOf(path)
    var envelopes = []
    path.slice(index + 1).forEach(function (id) {
        push.apply(envelopes, this.unrouted[id] || [])
        delete this.unrouted[id]
    }, this)
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

Legislator.prototype.returns = function (path, index) {
    var route = this.routeOf(path)
    var envelopes = []
    consume(route.envelopes, function (envelope) {
        var i = route.path.indexOf(envelope.to)
        if (i < index) {
            envelopes.push(envelope)
            return true
        }
        return false
    })
    path.slice(0, index).forEach(function (id) {
        push.apply(envelopes, this.unrouted[id] || [])
        delete this.unrouted[id]
    }, this)
    return envelopes
}

Legislator.prototype.inbox = function (envelopes) {
    envelopes.forEach(function (envelope) {
        this.dispatch({
            route: envelope.route,
            from: envelope.from,
            to: envelope.to,
            message: envelope.message
        })
    }, this)
}

Legislator.prototype.bootstrap = function () {
    var government = {
        id: '0/0',
        majority: [ this.id ],
        minority: []
    }
    this.citizens[this.id] = this.naturalized = '0/0'
    this.proposeGovernment(government)
    this.prepare()
}

Legislator.prototype.prepare = function () {
    var entry = this.log.max(), quorum = entry.quorum
    this.dispatch({
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
            // todo: will this happen, or will it reject the prepare?
            if (message.quorum[0] != this.id) {
                this.proposals.length = 0
            }
            this.promise = {
                id: message.promise,
                quorum: message.quorum
            }
            this.dispatch({
                to: envelope.from,
                message: {
                    type: 'promise',
                    promise: this.promise.id
                }
            })
        } else {
            this.dispatch({
                to: envelope.from,
                message: {
                    type: 'promised',
                    promise: this.promise.id
                }
            })
        }
    } else {
        // todo: test this by having two majority members first seek promises
        // from each other.
        this.dispatch({
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
}

Legislator.prototype.entry = function (id, message) {
    var entry = this.log.find({ id: id })
    if (!entry) {
        var entry = {
            id: id,
            accepts: [],
            learns: [],
            quorum: message.quorum,
            value: message.value
        }
        this.log.insert(entry)
    }
    ([ 'quorum', 'value', 'previous', 'internal' ]).forEach(function (key) {
        if (entry[key] == null && message[key] != null) {
            entry[key] = message[key]
        }
    })
    return entry
}

// todo: figure out how to merge into queue.
Legislator.prototype.createProposal = function (index, quorum, message) {
    var entry = this.log.max(), id = entry.id, proposal
    if (Id.compare(id, this.lastPromisedId) < 0) {
        id = this.lastPromisedId
    }
    id = this.lastPromisedId = Id.increment(id, index)
    return {
        id: id,
        internal: !! message.internal,
        value: message.value,
        quorum: quorum
    }
}

Legislator.prototype.newGovernment = function (government) {
    this.proposeGovernment(government)
    government.majority.slice(1).forEach(function (id) {
        this.dispatch({
            from: id,
            to: this.id,
            message: {
                type: 'synchronize',
                count: 20,
                greatest: this.greatestOf(id),
                learned: true
            }
        })
    }, this)
    this.prepare()
}

Legislator.prototype.proposeGovernment = function (government) {
    var iterator = this.log.findIter(this.log.max()), current = iterator.data()
    // todo: unlikely, maybe an assertion.
    while (!current.learned) {
        current = iterator.prev()
    }
    var message = {
        internal: true,
        value: {
            type: 'convene',
            government: government,
            terminus: current.id
        }
    }
    this.proposals.length = 0
    var proposal = this.createProposal(0, message.value.government.majority, message)
    var entry = this.entry(proposal.id, proposal)
    entry.promises = []
    this.proposals.push(proposal)
}

Legislator.prototype.proposeEntry = function (message) {
    var proposal = this.createProposal(1, this.government.majority, message)
    this.proposals.push(proposal)
    return proposal
}

Legislator.prototype.post = function (value, internal) {
    if (this.government.majority[0] != this.id) {
        return {
            posted: false,
            leader: this.government.majority[0]
        }
    }

    if (this.proposals.length && Id.isGovernment(this.proposals[0])) {
        return {
            posted: false,
            leader: null
        }
    }

    var proposal = this.proposeEntry({
        internal: internal,
        value: value
    })


    if (this.proposals.length == 1) {
        this.entry(proposal.id, proposal)
        this.accept()
    }

    return {
        posted: true,
        leader: this.government.majority[0],
        promise: proposal.id
    }
}

Legislator.prototype.accept = function () {
    var entry = this.log.max()
    this.dispatch({
        route: entry.quorum,
        message: {
            type: 'accept',
            internal: entry.internal,
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
            route: entry.quorum,
            message: {
                type: 'accepted',
                promise: message.promise,
                quorum: entry.quorum
            }
        })
    } else {
        this.dispatch({
            from: envelope.from,
            to: this.id,
            message: {
                type: 'synchronize',
                count: 20,
                greatest: this.greatestOf(envelope.from)
            }
        })
        this.dispatch({
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

Legislator.prototype.receiveAccepted = function (envelope, message) {
    var entry = this.entry(message.promise, message)
    assert(!~entry.accepts.indexOf(envelope.from))
    assert(~entry.quorum.indexOf(this.id))
    assert(~entry.quorum.indexOf(envelope.from))
    entry.accepts.push(envelope.from)
    if (entry.accepts.length >= entry.quorum.length)  {
        this.markAndSetGreatest(entry, 'learned')
        this.dispatch({
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
                skip = this.log.findIter(current)
                skip.next()
            }
        } else {
            skip = this.log.findIter(current)
        }

        terminus = skip.data()
        for (;;) {
            if (!terminus || Id.compare(terminus.id, '0/0', 1) != 0) {
                break OUTER
            }
            if (terminus.decided) {
                break
            }
            terminus = skip.next()
        }

        for (;;) {
            terminus = this.log.find({ id: terminus.value.terminus })
            if (!terminus) {
                break OUTER
            }
            // todo: test multiple links.
            if (Id.compare(current.id, terminus.id, 0) >= 0) {
                break
            }
        }

        // todo: test a break in log.
        if (Id.compare(terminus.id, current.id) != 0 && Id.compare(terminus.id, previous.id) != 0) {
            break
        }

        var uniform = [ terminus = skip.data() ]
        for (;;) {
            terminus = this.log.find({ id: terminus.value.terminus })
            uniform.push(terminus)
            // todo: test multiple links.
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

        terminus = skip
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
        if (
            entry.decided &&
            this.government.majority[0] == this.id &&
            Id.compare(this.proposals[0].id, entry.id) <= 0
        ) {
            this.proposals.shift()
            var proposal = this.proposals[0]
            if (proposal) {
                this.entry(proposal.id, proposal)
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
        route: this.promise.quorum,
        message: { type: 'nothing' }
    })
}

Legislator.prototype.receiveNothing = function () {
}

Legislator.prototype.receiveSynchronize = function (envelope, message) {
    assert(message.greatest, 'message must have greatest')
    this.greatest[envelope.from] = message.greatest

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

        var count = message.count - 1
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
        route: envelope.route,
        to: envelope.from,
        message: {
            type: 'ping',
            greatest: this.greatestOf(this.id)
        }
    })

    function createLearned (entry) {
        this.dispatch({
            route: envelope.route,
            from: entry.learns,
            to: envelope.from,
            message: {
                type: 'learned',
                promise: entry.id,
                quorum: entry.quorum,
                value: entry.value,
                internal: entry.internal
            }
        })
    }
}

// todo: figure out who has the highest uniform value and sync with them?
Legislator.prototype.receivePing = function (envelope, message) {
    this.greatest[envelope.from] = message.greatest
    this.dispatch({
        route: envelope.route,
        to: envelope.from,
        message: {
            type: 'pong',
            greatest: this.greatestOf(this.id)
        }
    })
}

Legislator.prototype.receivePong = function (envelope, message) {
    this.greatest[envelope.from] = message.greatest
}

Legislator.prototype.propagation = function () {
    var parliament = this.parliament = this.government.majority.concat(this.government.minority)
    this.constituency = []
    // todo: remove the `constituents` variable.
    var constituents = this.constituents = Object.keys(this.citizens).filter(function (id) {
        return !~parliament.indexOf(id)
    }).sort()
    if (parliament.length == 1) {
        this.constituency = constituents.slice()
    } else {
        var index = this.government.majority.slice(1).indexOf(this.id)
        if (~index) {
            var length = this.government.majority.length - 1
            this.constituency = this.government.minority.filter(function (id, i) {
                return i % length == index
            })
            if (this.government.minority.length == 0) {
                push.apply(this.constituency, constituents)
            }
        } else {
            var index = this.government.minority.indexOf(this.id)
            if (~index) {
                var length = this.government.minority.length
                this.constituency = constituents.filter(function (id, i) {
                    return i % length == index
                })
            }
        }
    }
}

Legislator.prototype.decideConvene = function (entry) {
    var terminus = this.log.find({ id: entry.value.terminus })
    assert(terminus)
    assert(terminus.learns.length > 0)
    assert(Id.compare(this.government.id, entry.id) < 0, 'governments out of order')
    this.government = entry.value.government
    this.government.id = entry.id
    this.propagation()
}

Legislator.prototype.naturalize = function (id) {
    return this.post({ type: 'naturalize', id: id }, true)
}

Legislator.prototype.decideNaturalize = function (entry) {
    var before = Object.keys(this.citizens).length
    this.citizens[entry.value.id] = entry.id
    this.propagation()
    if (entry.value.id == this.id) {
        this.naturalized = entry.id
    }
    var after = Object.keys(this.citizens).length
    if (this.government.majority[0] == this.id && after > before && after <= this.idealGovernmentSize) {
        this.proposeEntry({
            internal: true,
            value: {
                type: 'inaugurate',
                id: entry.value.id
            }
        })
    }
}

Legislator.prototype.majoritySize = function (parliamentSize, citizenCount) {
    var size = Math.min(parliamentSize, citizenCount)
    if (size % 2 == 0) {
        size++
    }
    return Math.ceil(size / 2)
}

Legislator.prototype.decideInaugurate = function (entry) {
    if (this.government.majority[0] == this.id) {
        var citizens = Object.keys(this.citizens)
        var majority = this.government.majority.slice()
        var parliamentSize = Math.min(this.idealGovernmentSize, citizens.length)
        var majoritySize = this.majoritySize(parliamentSize, citizens.length)
        var minority = this.government.minority.slice()
        var constituents = this.constituents.slice()
        minority.push(constituents.pop())
        if (majority.length < majoritySize) {
            majority.push(minority.pop())
        }
        this.newGovernment({
            majority: majority,
            minority: minority
        })
    }
}

Legislator.prototype.reelect = function () {
    if (~this.government.majority.indexOf(this.id)) {
        this.ticks[this.id] = this.clock()
        var majority = this.government.majority.filter(function (id) {
            return this.clock() - (this.ticks[id] || 0) < this.timeout
        }.bind(this))
        if (majority.length != this.government.majority.length) {
            var minority = this.government.minority.slice()
            var index = majority.indexOf(this.id)
            majority.unshift(majority.splice(index, 1)[0])
            var i = 0, I = this.government.minority.length;
            while (i < I && this.government.majority.length != majority.length) {
                if (this.clock() - (this.ticks[minority[i]] || 0) < this.timeout) {
                    majority.push(minority.splice(i, 1)[0])
                } else {
                    i++
                }
            }
            while (this.government.majority.length != majority.length) {
                var index = Math.floor(Math.random() * minority.length)
                majority.push(minority.splice(index, 1)[0])
            }
            var minority = this.parliament.filter(function (id) {
                return !~majority.indexOf(id)
            })
            this.newGovernment({
                majority: majority,
                minority: minority
            })
        }
    }
}

module.exports = Legislator
