var assert = require('assert')
var Monotonic = require('monotonic')
var cadence = require('cadence')
var push = [].push
var RBTree = require('bintrees').RBTree;

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
    compareGovernment: function (a, b) {
        a = Id.toWords(a)
        b = Id.toWords(b)
        return Monotonic.compare(a[0], b[0])
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

function Legislator (id) {
    this.id = id
    this.idealGovernmentSize = 5
    this.promise = { id: '0/1' }
    this.log = new RBTree(function (a, b) { return Id.compare(a.id, b.id) })
    this.government = { id: '0/1' }
    this.last = {}
    this.voting = false
    this.lastProposalId = '0/1'
    this.proposals = []
    this.last[id] = {
        learned: '0/1',
        decided: '0/1',
        uniform: '0/1'
    }
    var motion = {}
    this.queue = motion.prev = motion.next = motion

    var entry = this.entry('0/1', {
        id: '0/1',
        value: 0,
        quorum: 1
    })
    entry.learns = [ id ]
    entry.learned = true
    entry.decided = true
    entry.uniform = true
}

Legislator.prototype.bootstrap = function () {
    this.restarted = false
    this.government = {
        id: '0/1',
        leader: this.id,
        majority: [ this.id ],
        members: [ this.id ],
        interim: true
    }
    this.immigrated = this.naturalized = '0/1'
    this.createProposal(0, {
        internal: true,
        value: {
            type: 'convene',
            to: this.government.majority.slice(),
            from: [ this.id ],
            government: JSON.parse(JSON.stringify(this.government))
        }
    })
    return this.prepare()
}

Legislator.prototype.receiveTranscript = function (message) {
    return message.transcript
}

Legislator.synchronous = function (legislators, id, transcript, logger) {
    var machines = {}

    function assignMachineUnless (id) {
        var machine = machines[id]
        if (!machine) {
            machine = machines[id] = {
                id: id,
                routes: [],
                routed: [],
                unrouted: []
            }
        }
        return machine
    }

    assignMachineUnless(id).unrouted.push({
        from: [ id ],
        to: [ id ],
        type: 'transcript',
        transcript: transcript
    })

    function post (messages, route, index) {
        var legislator = legislators[route[index]], returns = [], response
        response = Legislator.route(legislator, messages, route, index, logger)
        assignMachineUnless(route[index]).unrouted = response.unrouted
        assignMachineUnless(route[index]).routed = response.routed
        assert(machine.unrouted.every(function (message) {
            return !~message.to.indexOf(legislator.id)
        }), 'messages must be unroutable')
        push.apply(returns, response.returns)
        if (index + 1 < route.length) {
            response = Legislator.route(legislator, post(response.forwards, route, index + 1), route, index, logger)
            push.apply(returns, response.returns)
        }
        route.pop()
        return returns
    }

    var machine
    for (;;) {
        var machine = machines[Object.keys(machines).pop()]
        if (!machine) {
            break
        }
        var route = machine.routes.pop()
        if (route) {
            post(machine.unrouted, route, 0, 0)
        } else if (machine.routed.length) {
            var routed = machine.routed.pop()
            machine.routes.push(routed.route)
            machine.unrouted.push(routed)
        } else if (machine.unrouted.length) {
            route = [ machine.id, machine.unrouted[0].to[0] ]
            if (route[0] == route[1]) {
                route.pop()
            }
            machine.routes.push(route)
        } else {
            delete machines[machine.id]
        }
    }
}

var count = 0

// The only proxied invocation is `accept`.
Legislator.route = function (legislator, messages, path, index, logger) {
    // Get the stack out of the path.
    var stack = path.slice(0, index + 1), forward = path.slice(index + 1)

    // Consume messages to self.
    var routed = [], keep, self
    for (;;) {
        keep = []
        self = false
        messages.forEach(function (message) {
            var copy = JSON.parse(JSON.stringify(message))
            var index
            if (~(index = message.to.indexOf(legislator.id))) {
                self = true
                logger(count, legislator.id, copy)
                message.to.splice(index, 1)
                var type = message.type
                var method = 'receive' + type[0].toUpperCase() + type.substring(1)
                push.apply(keep, legislator[method](copy))
            }
            if (message.to.length) {
                keep.push(message)
            }
        })
        messages = keep

        // Get the routed message if any.
        keep = []
        messages.forEach(function (message) {
            if (message.route && message.route.length) {
                routed.push(message)
            } else {
                keep.push(message)
            }
        })
        messages = keep

        // The only routed message is the accept, and those happen one at a time.
        assert(routed.length <= 1, 'only one specific route at a time')

        if (!self) {
            break
        }

        count++
    }

    var split = []
    messages.forEach(function (message) {
        message.to.forEach(function (to) {
            var copy = JSON.parse(JSON.stringify(message))
            copy.to = [ to ]
            split.push(copy)
        })
    })
    messages = split

    var unrouted = [], returns = {}, forwards = {}
    messages.forEach(function (message) {
        var returning = false, forwarding = false
        var key = message.type + '/' + message.id
        message.to.forEach(function (to) {
            if (~stack.indexOf(to)) {
                var existing = returns[key]
                if (!existing) {
                    existing = returns[key] = message
                } else {
                   existing.to.push(to)
                }
            } else if (~path.indexOf(to)) {
                var existing = forwards[key]
                if (!existing) {
                    existing = forwards[key] = message
                } else {
                    existing.to.push(to)
                }
            } else {
                unrouted.push(message)
            }
        })
    })

    function values (map) {
        var values = []
        for (var key in map) {
            values.push(map[key])
        }
        return values
    }

    return {
        returns: values(returns),
        forwards: values(forwards),
        routed: routed,
        unrouted: unrouted
    }
}

Legislator.prototype.enqueue = function (value) {
    assert(this.government.leader == this.id, 'not leader')
    var entry = { value: value, prev: this.queue.prev, next: this.queue }
    entry.next.prev = entry
    entry.prev.next = entry
}

Legislator.prototype.prepare = function () {
    return [{
        from: [ this.id ],
        to: this.government.majority.slice(),
        type: 'prepare',
        id: this.proposals[0].id
    }]
}

Legislator.prototype.receivePrepare = function (message) {
    var compare = Id.compareGovernment(this.promise.id, message.id)

    if (compare == 0) {
        return []
    }

    if (compare < 0) {
        this.promise = { id: message.id }
        return [{
            from: [ this.id ],
            to: message.from,
            type: 'promise',
            id: this.promise.id
        }]
    }

    return [{
        from: [ this.id ],
        to: [ message.from ],
        type: 'promised',
        id: this.promisedId
    }]
}

Legislator.prototype.receivePromise = function (message) {
    return [].concat.apply([], message.from.map(function (id) {
        var compare = Id.compare(this.proposals[0].id, message.id)

        if (compare != 0) {
            return []
        }

        if (!~this.proposals[0].quorum.indexOf(id)) {
            return []
        }

        if (!~this.proposals[0].promises.indexOf(id)) {
            this.proposals[0].promises.push(id)
        } else {
            // We have already received a promise. Something is probably wrong.
            return []
        }

        if (this.proposals[0].promises.length == this.proposals[0].quorum.length) {
            return this.accept()
        }

        return []
    }.bind(this)))
}

// todo: figure out how to merge into queue.
Legislator.prototype.createProposal = function (index, prototype) {
    this.proposals.push({
        id: this.lastProposalId = Id.increment(this.lastProposalId, index),
        internal: !! prototype.internal,
        value: prototype.value,
        quorum: this.government.majority.slice(),
        promises: [],
        accepts: []
    })
}

Legislator.prototype.accept = function () {
    this.entry(this.proposals[0].id, {
        quorum: this.government.majority.length,
        value: this.proposals[0].value
    })
    return [{
        from: [ this.id ],
        to: this.government.majority.slice(),
        route: this.government.majority.slice(),
        type: 'accept',
        internal: this.proposals[0].internal,
        quorum: this.government.majority.length,
        id: this.proposals[0].id,
        value: this.proposals[0].value
    }]
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

Legislator.prototype.receiveAccept = function (message) {
    var compare = Id.compareGovernment(this.promise.id, message.id)
    if (compare > 0) {
        return [{
            type: 'reject'
        }]
    } else if (compare < 0) {
    } else {
        this.entry(message.id, message)
        return [{
            from: [ this.id ],
            to: this.government.majority.slice(),
            type: 'accepted',
            id: message.id
        }]
    }
}

Legislator.prototype.markLastest = function (entry, type) {
    if (Id.compare(this.last[this.id][type], entry.id) < 0) {
        this.last[this.id][type] = entry.id
    }
    entry[type] = true
}

Legislator.prototype.receiveAccepted = function (message) {
    var entry = this.entry(message.id, message), messages = []
    message.from.forEach(function (id) {
        if (!~entry.accepts.indexOf(id)) {
            entry.accepts.push(id)
        }
        if (entry.accepts.length >= entry.quorum && !entry.learned)  {
            this.markLastest(entry, 'learned')
            entry.learned = true
            if (!this.restarted && ~this.government.majority.indexOf(this.id)) {
                messages.push({
                    from: [ this.id ],
                    to: [ this.government.leader ],
                    type: 'learned',
                    id: message.id
                })
            }
            push.apply(messages, this.dispatchInternal('learn', entry))
        }
    }, this)
    return messages
}

Legislator.prototype.dispatchInternal = function (prefix, entry) {
    if (entry.internal) {
        var type = entry.value.type
        var method = prefix + type[0].toUpperCase() + type.slice(1)
        if (typeof this[method] == 'function') {
            return this[method](entry)
        }
    }
    return []
}

Legislator.prototype.markUniform = function () {
    var last = this.last[this.id],
        iterator = this.log.findIter({ id: this.last[this.id].uniform }),
        previous, current
    for (;;) {
        previous = iterator.data(), current = iterator.next()

        if (!current) {
            break
        }

        if (Id.compare(Id.increment(previous.id, 1), current.id) == 0) {
            assert(previous.uniform || previous.ignored, 'previous must be resolved')
            if (current.decided) {
                current.uniform = true
                last.uniform = current.id
                continue
            }
        } else {
            previous = iterator.prev(), current = iterator.data()
        }

        var end = trampoline.call(this, transition, this.log.findIter({ id: current.id }))
        if (!end) {
            break
        }

        if (Id.compare(current.id, end.terminus, 0) != 0) {
            break
        }

        if (Id.compare(current.id, end.terminus) < 0) {
            break
        }

        assert(Id.compare(current.id, end.terminus) == 0 ||
               Id.compare(previous.id, end.terminus) == 0, 'terminus beyond decisions')

        iterator = this.log.findIter({ id: end.terminus })
        previous = iterator.data()
        previous.uniform = true

        for (;;) {
            previous = iterator.data(), current = iterator.next()
            if (Id.compare(current.id, end.government) == 0) {
                break
            }
            current.ignored = true
        }

        current.uniform = true
    }

    function trampoline (f, i) {
        while (typeof (f = f.call(this, i)) == 'function');
        return f
    }

    // TODO: This becomes a while loop where `return null` is `break OUTER` and
    // `return transition` is `continue`. Then `i` is simply `j`.
    function transition (i) {
        // Read from our iterator.
        var previous = i.data(), current = i.next()

        // If we are not at a goverment transition, then the previous entry
        // cannot be known to be incomplete.
        if (current == null || Id.compare(previous.id, current.id, 0) == 0) {
            return null
        }

        // Ideally will be looking at the start of a new government.
        previous = i.data(), current = i.next()

        // At least two entries create a continual government.
        if (current == null) {
            return null
        }

        // The next uniform entry would be the start of a new government.
        if (Id.compare(previous.id, '0/0', 1) != 0) {
            return null
        }

        // If it did not settle old business, it might have failed.
        if (Id.compare(Id.increment(previous.id, 1), current.id) != 0) {
            return transition
        }

        // We now have the correct records for the start of a new government,
        // did they become actionable? The we have a continual government.
        if (previous.decided) {
            if (current.decided) {
                return { terminus: current.value.id, government: previous.id }
            }
            // Perhaps our old business entry is inactionable and this
            // government failed.
            return transition
        }

        // This probably cannot be reached, since every entry we get will be
        // decided except for one that was left inside an legislator.
        return transition
    }
}

Legislator.prototype.receiveLearned = function (message) {
    var entry = this.entry(message.id, message), messages = []
    message.from.forEach(function (id) {
        if (!~entry.learns.indexOf(id)) {
            entry.learns.push(id)
        }
        if (entry.learns.length == entry.quorum) {
            this.markLastest(entry, 'learned')
            this.markLastest(entry, 'decided')
            if (Id.compare(entry.id, this.last[this.id].decided) > 0) {
                this.last[this.id].decided = entry.id
            }
            this.markUniform()
            push.apply(messages, this.dispatchInternal('decide', entry))
        }
        if (entry.decided &&
            this.proposals.length &&
            Id.compare(this.proposals[0].id, message.id) == 0
        ) {
            this.proposals.shift()
            messages.push({
                from: this.government.majority.slice(),
                to: this.government.majority.filter(function (id) {
                    return id != this.id
                }.bind(this)),
                type: 'learned',
                id: message.id
            })
            if (this.proposals.length) {
                push.apply(messages, this.accept())
            }
        }
    }, this)
    return messages
}

Legislator.prototype.learnConvene = function (entry) {
    if (Id.compare(this.government.id, entry.id) < 0) {
        this.government = entry.value.government
        this.government.id = entry.id
        if (this.government.leader != this.id) {
            return this.sync([ this.government.leader ], 0)
        }
    }
    return []
}

Legislator.prototype.sync = function (to, count) {
    return [{
        type: 'synchronize',
        from: [ this.id ],
        to: to,
        count: count,
        joined: null,
        last: this.last[this.id]
    }]
}

Legislator.prototype.decideConvene = function (entry) {
    this.learnConvene(entry)
    // todo: naturalization tests go here, or check proposal.
    if (this.government.leader == this.id && entry.id == this.proposals[0].id) {
        var majority = this.government.majority.slice()
        // new rule: the majority is always not more than one away from being uniform.
        // todo: not difficult, you will be able to use most decided. Not sort
        // the majority, because we will all be in sync.
        majority.sort(function (a, b) {
            return Id.compare(this.last[b].decided, this.last[a].decided)
        }.bind(this))
        var iterator = this.log.findIter({ id: entry.id }), current
        do {
            current = iterator.prev()
        } while (Id.compare(current.id, '0/0', 1) == 0 || !current.decided)
        var terminus = current.id
        assert(majority[0] == this.id, 'need to catch up')
        this.createProposal(1, {
            internal: true,
            value: {
                type: 'commence',
                government: this.government,
                id: terminus
            }
        })
    }
    return []
}

Legislator.prototype.decideCommence = function (entry) {
    if (Id.compare(this.government.id, entry.id)) {
        this.government = entry.value.government
        this.government.interim = false
        this.government.id = entry.id
    }
    return []
}

Legislator.prototype.receiveSynchronize = function (message) {
    assert(message.from.length == 1, 'multi synchronize')

    assert(message.last, 'message must have last')
    var last = this.last[message.from[0]] = message.last

    var messages = []

    assert(!~message.from.indexOf(this.id), 'synchronize with self')

    if (message.count) {
        messages.push({
            from: [ this.id ],
            to: message.from,
            type: 'synchronize',
            count: 0,
            last: this.last[this.id]
        })

        var lastUniformId = this.last[this.id].uniform
        message.count--
        messages.push(createLearned(message.from, this.log.find({ id: this.last[this.id].uniform })))

        var iterator = this.log.findIter({ id: this.last[message.from[0]].uniform }), entry
        var count = (message.count - 1) || 0
        var greatest = this.last[message.from[0]].uniform
        // todo: while (count-- && (entry = iterator.next()).id != lastUniformId) {
        // ^^^ needs short circult.
        while (count-- && (entry = iterator.next()) != null && entry.id != lastUniformId) {
            if (entry.uniform) {
                greatest = entry.id
                messages.push(createLearned(message.from, entry))
            } else if (!entry.ignored) {
                break
            }
        }

        // todo: if leader.
        if (Id.increment(greatest, 1) == lastUniformId) {
            this.createProposal(1, {
                internal: true,
                value: {
                    type: 'immigrate',
                    id: message.from[0]
                }
            })
            messages.push.apply(messages, this.accept())
        }

        messages.push({
            to: message.from,
            from: [ this.id ],
            type: 'synchronized'
        })
    }

    return messages

    function createLearned (to, entry) {
        return {
            type: 'learned',
            to: to,
            from: entry.learns.slice(),
            id: entry.id,
            quorum: entry.quorum,
            value: entry.value,
            internal: entry.internal
        }
    }
}

// todo: figure out who has the highest uniform value and sync with them?
Legislator.prototype.receiveSynchronized = function (message) {
    if (this.government.leader === this.id) {
        var last = this.last[message.from[0]]
        if (message.joined == null && last.uniform === this.last[this.id].uniform) {
            throw new Error
        }
    }
}

Legislator.prototype.post = function (value) {
    return [{
        from: [ this.id ],
        to: [ this.government.leader ],
        government: this.government.id,
        type: 'post',
        value: value
    }]
}

Legislator.prototype.recievePost = function (message) {
    // todo: be super sure that this is a good current government, reject if
    // not and as soon as possible.
    // todo: maybe they supply the government they attempting to petition.
    // The requested government has been replaced.
    if (message.government != this.government.id) {
        return [{
            from: [ this.id ],
            to: message.from.slice(),
            status: 410,
            type: 'posted'
        }]
    }
    // Correct government, but not the leader.
    if (this.government.leader != this.id) {
        return [{
            from: [ this.id ],
            to: message.from.slice(),
            status: 405,
            type: 'posted'
        }]
    }
    // Correct government and the leader.
    var proposal = {
        id: Id.increment(this.proposals[this.proposals.length - 1].id, index),
        internal: !! prototype.internal,
        value: prototype.value,
        quorum: this.government.majority.slice(),
        previous: previous.id,
        promises: [],
        accepts: []
    }
    this.proposals.push(proposal)
    if (!this.voting) {
        this.voting = true
        this.proposals.shift()
    }
}

Legislator.prototype.recievePosted = function () {
}

module.exports = Legislator
