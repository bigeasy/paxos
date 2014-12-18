var assert = require('assert')
var Monotonic = require('monotonic')
var cadence = require('cadence')
var push = [].push
var slice = [].slice
var RBTree = require('bintrees').RBTree;
var Cache = require('magazine')

var consume = require('./consume')

var Cookie = {
    increment: function (cookie) {
        return Monotonic.toString(Monotonic.increment(Monotonic.parse(cookie)))
    }
}

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
    }
}

function Legislator (id, options) {

    options || (options = {})

    this.id = id
    this.clock = options.clock || function () { return Date.now() }
    this.messageId = id + '/0'
    // it appears that the only point of the cookie is to mark naturalization.
    this.cookie = '0'
    this.idealGovernmentSize = options.size || 5
    this.log = new RBTree(function (a, b) { return Id.compare(a.id, b.id) })
    this.government = { id: '0/0', minority: [], majority: [] }
    this.greatest = {}
    this.voting = false
    this.lastPromisedId = '0/0'
    this.proposals = []
    this.citizens = {}
    this.routed = new Cache().createMagazine()
    this.unrouted = {}
    this.greatest[id] = {
        learned: '0/1',
        decided: '0/1',
        uniform: '0/1'
    }
    this.outcomes = []
    this.ticks = {}
    this.timeout = options.timeout || 5000
    this.promise = { id: '0/0', quorum: [] }
    var motion = {}
    this.queue = motion.prev = motion.next = motion

    var entry = this.entry('0/1', {
        id: '0/1',
        value: 0,
        quorum: [ id ]
    })
    entry.learns = [ id ]
    entry.learned = true
    entry.decided = true
    entry.uniform = true

    this.cookies = new Cache().createMagazine()
}

Legislator.prototype.bootstrap = function () {
    this.restarted = false
    var government = {
        id: '0/0',
        majority: [ this.id ],
        minority: []
    }
    this.citizens[this.id] = this.naturalized = '0/0'
    this.proposeGovernment(government)
    this.prepare()
}

Legislator.prototype.ingest = function (envelopes) {
    envelopes.forEach(function (envelope) {
        if (envelope.route == '-') {
            var envelopes = this.unrouted[envelope.to]
            if (!envelopes) {
                envelopes = this.unrouted[envelope.to] = []
            }
            envelopes.push(envelope)
        } else {
            var cartridge = this.routed.hold(envelope.route, false)
            assert(cartridge, 'no route for cartridge')
            cartridge.value.envelopes.push(envelope)
            cartridge.release()
        }
    }, this)
}

Legislator.prototype.consume = function (filter) {
    consume(this.unrouted[this.id] || [], intercept, this)
    if (this.unrouted[this.id] && this.unrouted[this.id].length == 0) {
        delete this.unrouted[this.id]
    }

    var purge = this.routed.purge(), consumed = false
    try {
        while (purge.cartridge) {
            consume(purge.cartridge.value.envelopes, intercept, this)
            purge.release()
            purge.next()
        }
    } finally {
        purge.release()
    }

    function intercept (envelope) {
        this.ticks[envelope.from] = this.clock()
        if (envelope.to == this.id) {
            consumed = true
            var type = envelope.message.type
            var method = 'receive' + type[0].toUpperCase() + type.substring(1)
            filter.call(this, envelope, envelope.message).forEach(function (envelope) {
                this[method](envelope, envelope.message)
            }, this)
            return true
        }
    }

    return consumed
}

Legislator.prototype.prepare = function () {
    var entry = this.log.max()
    this.pulse(entry.quorum, {
        type: 'prepare',
        promise: entry.id,
        quorum: entry.quorum
    })
}

Legislator.prototype.receivePrepare = function (envelope, message) {
    if (Id.compare(this.greatest[this.id].decided, this.greatest[this.id].uniform) == 0) {
        var compare = Id.compare(this.promise.id, message.promise, 0)
        if (compare < 0) {
            this.proposals.length = 0
            this.promise = {
                id: message.promise,
                quorum: message.quorum
            }
            this.pulse(this.promise.quorum, [ envelope.from ], {
                type: 'promise',
                promise: this.promise.id
            })
        } else {
            this.pulse(this.promise.quorum, [ envelope.from ], {
                type: 'promised',
                promise: this.promise.id
            })
        }
    } else {
        throw new Error
        this.send([ envelope.from ], {
            type: 'promised',
            promise: this.promise.id
        })
    }
}

Legislator.prototype.receivePromise = function (envelope, message) {
    var entry = this.log.max(), compare = Id.compare(entry.id, message.promise)
    if (compare == 0 && ~entry.quorum.indexOf(envelope.from)) {
        if (!~entry.promises.indexOf(envelope.from)) {
            entry.promises.push(envelope.from)
            if (entry.promises.length == entry.quorum.length) {
                this.accept()
            }
        }
    }
}

Legislator.prototype.proposeGovernment = function (government) {
    var iterator = this.log.findIter(this.log.max()), current = iterator.data()
    while (Id.compare(current.id, '0/0', 1) == 0 || !current.learned) {
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
    var purge = this.routed.purge()
    while (purge.cartridge) {
        if (purge.cartridge.value.path[0] == this.id) {
            purge.cartridge.remove()
        } else {
            purge.cartridge.release()
        }
        purge.next()
    }
    purge.release()
    this.proposals.length = 0
    var proposal = this.createProposal(0, message.value.government.majority, message)
    var entry = this.entry(proposal.id, proposal)
    entry.promises = []
    this.addRoute(entry.quorum)
}

Legislator.prototype.proposeEntry = function (message) {
    this.addRoute(this.promise.quorum)
    var proposal = this.createProposal(1, this.government.majority, message)
    this.proposals.push(proposal)
    return proposal
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
        quorum: quorum,
        promises: [], // todo: unused.
        accepts: []
    }
}

Legislator.prototype.accept = function () {
    var entry = this.log.max()
    this.pulse(entry.quorum, {
        type: 'accept',
        internal: entry.internal,
        quorum: entry.quorum,
        promise: entry.id,
        value: entry.value
    })
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

Legislator.prototype.receiveAccept = function (envelope, message) {
    var compare = Id.compare(this.promise.id, message.promise, 0)
    if (compare > 0) {
        throw new Error('reject')
    } else if (compare < 0) {
    } else {
        var entry = this.entry(message.promise, message)
        this.pulse(entry.quorum, {
            quorum: entry.quorum,
            type: 'accepted',
            promise: message.promise
        })
    }
}

Legislator.prototype.markAndSetGreatest = function (entry, type) {
    if (!entry[type]) {
        if (Id.compare(this.greatest[this.id][type], entry.id) < 0) {
            this.greatest[this.id][type] = entry.id
        }
        entry[type] = true
        return true
    }
    return false
}

Legislator.prototype.receiveAccepted = function (envelope, message) {
    var entry = this.entry(message.promise, message)
    if (!~entry.accepts.indexOf(envelope.from)) {
        entry.accepts.push(envelope.from)
        if (entry.accepts.length >= entry.quorum.length)  {
            this.markAndSetGreatest(entry, 'learned')
            if (~entry.quorum.indexOf(this.id)) {
                this.pulse(this.promise.quorum, {
                    type: 'learned',
                    promise: message.promise
                })
            }
        }
    }
}

Legislator.prototype.markUniform = function (entry) {
    assert(entry.learns.length > 0)
    if (this.markAndSetGreatest(entry, 'uniform')) {
        if (entry.internal) {
            var type = entry.value.type
            var method = 'decide' + type[0].toUpperCase() + type.slice(1)
            if (typeof this[method] == 'function') {
                this[method](entry)
            }
        }
    }
}

Legislator.prototype.playUniform = function () {
    var iterator = this.log.findIter({ id: this.greatest[this.id].uniform }), skip,
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
            if (Id.compare(current.id, terminus.id, 0) >= 0) {
                break
            }
        }

        if (Id.compare(terminus.id, current.id) != 0 && Id.compare(terminus.id, previous.id) != 0) {
            break
        }

        var uniform = [ terminus = skip.data() ]
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

        terminus = skip
    }
}

Legislator.prototype.__defineGetter__('parliament', function () {
    return [].concat(this.government.majority, this.government.minority)
})

Legislator.prototype.__defineGetter__('constituents', function () {
    var parliament = this.parliament
    return Object.keys(this.citizens).map(function (id) {
        return +id
    }).filter(function (id) {
        return !~parliament.indexOf(id)
    })
})

Legislator.prototype.receiveLearned = function (envelope, message) {
    var entry = this.entry(message.promise, message)
    if (!~entry.learns.indexOf(envelope.from)) {
        entry.learns.push(envelope.from)
        if (entry.learns.length == entry.quorum.length) {
            this.markAndSetGreatest(entry, 'learned')
            this.markAndSetGreatest(entry, 'decided')
            if (Id.compare(entry.id, this.greatest[this.id].decided) > 0) {
                this.greatest[this.id].decided = entry.id
            }
        }
        this.playUniform()
        // Share this decision with the minority of parliament.
        if (entry.decided &&
            ~this.government.majority.indexOf(this.id)
        ) {
            var index = this.government.majority.indexOf(this.id)
            var length = this.government.majority.length
            this.government.minority.forEach(function (id) {
                if (id % length == index) {
                    this.send([ id ], [ this.id ], {
                        type: 'synchronize',
                        count: 20,
                        greatest: this.greatest[id] || { uniform: '0/0' }
                    })
                }
            }, this)
        }
        // Share this decision with constituents.
        if (entry.decided &&
            ~this.government.minority.indexOf(this.id)
        ) {
            var index = this.government.minority.indexOf(this.id)
            var length = this.government.minority.length
            this.constituents.forEach(function (id) {
                if (id % length == index) {
                    this.send([ id ], [ this.id ], {
                        type: 'synchronize',
                        count: 20,
                        greatest: this.greatest[id] || { uniform: '0/0' }
                    })
                }
            }, this)
        }
        // Shift the next entry or else send final learning pulse.
        if (
            entry.decided &&
            this.government.majority[0] == this.id
        ) {
            var proposal = this.proposals.shift()
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
    this.pulse(this.promise.quorum, { type: 'nothing' })
}

Legislator.prototype.receiveNothing = function () {
}

Legislator.prototype.sync = function (to, count) {
    this.send(to, {
        type: 'synchronize',
        count: count,
        greatest: this.greatest[this.id]
    })
}

Legislator.prototype.decideConvene = function (entry) {
    var terminus = this.log.find({ id: entry.value.terminus })
    assert(terminus)
    assert(terminus.learns.length > 0)
    if (Id.compare(this.government.id, entry.id) < 0) {
        this.government = entry.value.government
        this.government.id = entry.id
    }
}

Legislator.prototype.receiveSynchronize = function (envelope, message) {
    assert(message.greatest, 'message must have greatest')
    this.greatest[envelope.from] = message.greatest

    assert(message.from != this.id, 'synchronize with self')

    if (message.count) {
        if (message.learned &&
            this.greatest[this.id].learned != this.greatest[envelope.from].learned
        ) {
            createLearned.call(this, this.log.find({ id: this.greatest[this.id].learned }))
        }

        var lastUniformId = this.greatest[this.id].uniform
        if (lastUniformId != this.greatest[envelope.from].uniform) {
            createLearned.call(this, this.log.find({ id: lastUniformId }))

            var count = (message.count - 1) || 0
            var iterator = this.log.lowerBound({ id: this.greatest[envelope.from].uniform }), entry
            var greatest = this.greatest[envelope.from].uniform

            while (count-- && (entry = iterator.next()) != null && entry.id != lastUniformId) {
                if (entry.uniform) {
                    greatest = entry.id
                    createLearned.call(this, entry)
                } else if (!entry.ignored) {
                    break
                }
            }
        }

        this.send([ envelope.from ], {
            type: 'synchronized',
            greatest: this.greatest[this.id],
            citizens: this.citizens,
            government: this.government
        })
    }

    function createLearned (entry) {
        this.send(entry.learns, [ envelope.from ], {
            type: 'learned',
            promise: entry.id,
            quorum: entry.quorum,
            value: entry.value,
            internal: entry.internal
        })
    }
}

// todo: figure out who has the highest uniform value and sync with them?
Legislator.prototype.receiveSynchronized = function (envelope, message) {
    this.greatest[envelope.from] = message.greatest
}

Legislator.prototype.post = function (value, internal) {
    var cookie = this.cookie = Cookie.increment(this.cookie)
    this.cookies.hold(cookie, {
        internal: !! internal,
        value: value
    }).release()
    this.send([ this.government.majority[0] ], {
        type: 'post',
        internal: !! internal,
        cookie: cookie,
        government: this.government.id,
        value: value
    })
    return cookie
}

Legislator.prototype.addRoute = function (path) {
    var id = path.join(' -> '),
        cartridge = this.routed.hold(id, { initialized: false })
    if (cartridge.value.initialized) {
        assert(cartridge.value.id == id &&
               cartridge.value.path.every(function (value, index) {
                   return value == path[index]
               }), 'route not as expected')
    } else {
        cartridge.value = {
            initialized: true,
            id: id,
            path: path,
            envelopes: []
        }
    }
    cartridge.release()
}

Legislator.prototype.unroute = function () {
    var unrouted = Object.keys(this.unrouted)
    if (unrouted.length) {
        var envelope = this.unrouted[unrouted[0]][0]
        return {
            id: '-',
            path: [ envelope.from, envelope.to ]
        }
    }
}

Legislator.prototype.route = function () {
    var cartridge = this.routed.hold(this.promise.quorum.join(' -> '), false)
    if (!cartridge.value) {
        cartridge.remove()
    } else if (cartridge.value.envelopes.length) {
        var pulse = cartridge.value
        cartridge.value = {
            initialized: true,
            id: pulse.id,
            path: pulse.path,
            envelopes: []
        }
        cartridge.release()
        var id = this.id
        assert(!pulse.envelopes.some(function (envelope) {
            return envelope.to == id
        }), 'lost notes to self')
        return pulse
    } else {
        cartridge.release()
    }
    return null
}

Legislator.prototype.pulse = function () {
    var vargs = slice.call(arguments),
        message = vargs.pop(),
        to = vargs.pop(),
        route = vargs.pop() || to,
        id = route.join(' -> ')
    var cartridge = this.routed.hold(id, false)
    assert(cartridge, 'cannot find route')
    push.apply(cartridge.value.envelopes, this.stuff([ this.id ], to, id, message))
    cartridge.release()
}

Legislator.prototype.send = function () {
    var vargs = slice.call(arguments),
        message = vargs.pop(), to = vargs.pop(), from = vargs.pop() || [ this.id ]
    this.stuff(from, to, '-', message).forEach(function (envelope) {
        var envelopes = this.unrouted[envelope.to]
        if (!envelopes) {
            envelopes = this.unrouted[envelope.to] = []
        }
        envelopes.push(envelope)
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
            envelopes.push(envelope)
        }, this)
    }, this)
    return envelopes
}

Legislator.prototype.receivePost = function (envelope, message) {
    // todo: be super sure that this is a good current government, reject if
    // not and as soon as possible.
    // todo: maybe they supply the government they attempting to petition.
    // The requested government has been replaced.
    if (message.government != this.government.id) {
        this.send([ envelope.from ], {
            type: 'posted',
            cookie: message.cookie,
            statusCode: 410
        })
    }
    // Correct government, but not the leader.
    if (this.government.majority[0] != this.id) {
        this.send([ envelope.from ], {
            type: 'posted',
            cookie: message.cookie,
            statusCode: 405
        })
    }
    // Correct government and the leader.
    var proposal = this.proposeEntry({
        internal: message.internal,
        value: message.value
    })

    this.send([ envelope.from ], {
        type: 'posted',
        cookie: message.cookie,
        statusCode: 200,
        promise: proposal.id
    })

    if (this.proposals.length == 1) {
        this.proposals.shift()
        this.entry(proposal.id, proposal)
        this.accept()
    }
}

// todo: Need to be sure about this. Yes, there will be times when it is false,
// that an isolated leader has lost the leadership position, but it needs to be
// true enough.
// todo: Isn't this really a property I set?
Legislator.prototype.__defineGetter__('isLeader', function () {
    return this.naturalized && this.government.majority[0] == this.id
})

Legislator.prototype.decideInaugurate = function (entry) {
    if (this.isLeader) {
        var citizens = Object.keys(this.citizens).map(function (id) { return +id })
        var majority = this.government.majority.slice()
        var parliamentSize = Math.min(this.idealGovernmentSize, citizens.length)
        var majoritySize = this.majoritySize(parliamentSize, citizens.length)
        var minority = this.government.minority.slice()
        var constituents = citizens.filter(function (id) {
            return !~minority.indexOf(id) && !~majority.indexOf(id)
        })
        minority.push(constituents.pop())
        if (majority.length < majoritySize) {
            majority.push(minority.pop())
        }
        this.proposeGovernment({
            majority: majority,
            minority: minority
        })
        // todo: this all breaks when we actually queue.
        this.prepare()
        majority.slice(1).forEach(function (id) {
            this.send([ id ], [ this.id ], {
                type: 'synchronize',
                count: 20,
                greatest: this.greatest[id] || { decided: '0/0', uniform: '0/0' },
                learned: true
            })
        }, this)
    }
}

Legislator.prototype.decideNaturalize = function (entry) {
    var before = Object.keys(this.citizens).length
    this.citizens[entry.value.id] = entry.id
    if (entry.cookie) {
        this.naturalized = entry.id
    }
    var after = Object.keys(this.citizens).length
    if (this.isLeader && after > before && after <= this.idealGovernmentSize) {
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

Legislator.prototype.receivePosted = function (envelope, message) {
    if (message.statusCode == 200) {
        var cartridge = this.cookies.hold(message.cookie, false)
        if (cartridge.value) {
            var entry = this.entry(message.promise, cartridge.value)
            entry.cookie = message.cookie
            this.outcomes.push({
                type: 'posted',
                entry: entry
            })
        }
        cartridge.remove()
    }
}

Legislator.prototype.naturalize = function () {
    return this.post({ type: 'naturalize', id: this.id }, true)
}

Legislator.prototype.reelect = function () {
    if (this.id != this.government.majority[0] && ~this.government.majority.indexOf(this.id)) {
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
                    majority.push(minority.splice(i, 1))
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
            var government = {
                majority: majority,
                minority: minority
            }
            government.majority.concat(government.minority).forEach(function (id) {
                this.send([ id ], [ this.id ], {
                    type: 'synchronize',
                    count: 20,
                    greatest: this.greatest[id] || { uniform: '0/0' }
                })
            }, this)
            this.proposeGovernment(government)
            this.prepare()
            majority.slice(1).forEach(function (id) {
                this.send([ id ], [ this.id ], {
                    type: 'synchronize',
                    count: 20,
                    greatest: this.greatest[id] || { decided: '0/0', uniform: '0/0' },
                    learned: true
                })
            }, this)
        }
    }
}

module.exports = Legislator
