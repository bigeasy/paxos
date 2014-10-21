var assert = require('assert')
var Monotonic = require('monotonic')
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
    compare: function (a, b) {
        a = Id.toWords(a)
        b = Id.toWords(b)
        var compare = Monotonic.compare(a[0], b[0])
        if (compare == 0) {
            return Monotonic.compare(a[1], b[1])
        }
        return compare
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
        return Id.toString(next)
    }
}

function Legislator (id) {
    this.id = id
    this.proposal = { id: '0/0' }
    this.promise = { id: '0/0' }
    this.log = new RBTree(function (a, b) { return Id.compare(a.id, b.id) })
    this.government = {
        leader: 0,
        majority: [ 0, 1, 2 ],
        members: [ 0, 1, 2, 3, 4 ]
    }
    var entry = {}
    this.queue = entry.prev = entry.next = entry
}

Legislator.prototype.bootstrap = function () {
    this.government = {
        leader: this.id,
        majority: [ this.id ],
        members: [ this.id ],
        interim: true
    }
    this.entry('0/0', {}).actionable = true
    return this.propose({
        internal: true,
        value: {
            type: 'government',
            to: this.government.majority.slice(),
            from: [ this.id ],
            government: this.government
        }
    })
}

Legislator.dispatch = function (messages, legislators) {
    var responses = []
    messages.forEach(function (message) {
        var type = message.type
        var method = 'receive' + type[0].toUpperCase() + type.substring(1)
        legislators.forEach(function (legislator) {
            var index
            if (~(index = message.to.indexOf(legislator.id))) {
                message.to.splice(index, 1)
                push.apply(responses, legislator[method](message))
                if (message.forward && message.forward.length) { // todo: validator.forward(message)
                    var forward = {}
                    for (var key in message) {
                        forward[key] = message[key]
                    }
                    forward.to = [ message.forward[0] ]
                    if (message.forward.length == 1) {
                        delete forward.forward
                    } else {
                        forward.forward = message.forward.slice(1)
                    }
                    responses.push(forward)
                }
            }
        })
        if (message.to.length) {
            responses.push(message)
        }
    })
    var decisions = {}, amalgamated = []
    responses.forEach(function (message) {
        var key = Id.toString(message.id)
        var decision = decisions[key]
        if (!decision) {
            decision = decisions[key] = { messages: [] }
        }
        var previous = decision.messages[message.type]
        if (!previous) {
            previous = decision.messages[message.type] = message
            amalgamated.push(message)
        } else {
            message.from.forEach(function (id) {
                if (!~previous.from.indexOf(id)) {
                    previous.from.push(id)
                }
            })
            message.to.forEach(function (id) {
                if (!~previous.to.indexOf(id)) {
                    previous.to.push(id)
                }
            })
        }
    })
    return amalgamated
}

Legislator.prototype.enqueue = function (value) {
    assert(this.government.leader == this.id, 'not leader')
    var entry = { value: value, prev: this.queue.prev, next: this.queue }
    entry.next.prev = entry
    entry.prev.next = entry
}

Legislator.prototype.propose = function (proposal) {
    this.createProposal(proposal)
    return [{
        from: [ this.id ],
        to: this.government.majority.slice(),
        type: 'prepare',
        id: this.proposal.id
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
        var compare = Id.compare(this.proposal.id, message.id)

        if (compare != 0) {
            return []
        }

        if (!~this.proposal.quorum.indexOf(id)) {
            return []
        }

        if (!~this.proposal.promises.indexOf(id)) {
            this.proposal.promises.push(id)
        } else {
            // We have already received a promise. Something is probably wrong.
            return []
        }

        if (this.proposal.promises.length == this.proposal.quorum.length) {
            return this.accept()
        }

        return []
    }.bind(this)))
}

Legislator.prototype.createProposal = function (prototype) {
    var previous = this.log.max() || {}
    this.proposal = {
        id: Id.increment(this.proposal.id, 0),
        internal: !! prototype.internal,
        value: prototype.value,
        quorum: this.government.majority.slice(),
        previous: previous.id,
        promises: [],
        accepts: []
    }
}

Legislator.prototype.accept = function () {
    this.entry(this.proposal.id, {
        quorum: this.government.majority.length,
        value: this.proposal.value
    })
    return [{
        from: [ this.id ],
        to: [ this.government.majority[0] ],
        forward: this.proposal.quorum.slice(1),
        type: 'accept',
        internal: this.proposal.internal,
        previous: this.proposal.previous,
        quorum: this.government.majority.length,
        id: this.proposal.id,
        value: this.proposal.value
    }, {
        from: [ this.id ],
        to: this.government.majority.slice(),
        type: 'accepted',
        id: this.proposal.id
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
            type: 'accepted',
            from: [ this.id ],
            to: this.government.majority.slice(),
            id: message.id
        }]
    }
}

Legislator.prototype.receiveAccepted = function (message) {
    var entry = this.entry(message.id, message), messages = []
    message.from.forEach(function (id) {
        if (!~entry.accepts.indexOf(id)) {
            entry.accepts.push(id)
        }
        if (entry.accepts.length >= entry.quorum && !entry.learned)  {
            entry.learned = true
            if (~this.government.majority.indexOf(this.id)) {
                messages.push({
                    from: [ this.id ],
                    to: [ this.government.leader ],
                    type: 'learned',
                    id: message.id
                })
            }
        }
    }, this)
    return messages
}

Legislator.prototype.receiveLearned = function (message) {
    var entry = this.entry(message.id, message), messages = []
    message.from.forEach(function (id) {
        if (!~entry.learns.indexOf(id)) {
            entry.learns.push(id)
        }
        if (entry.learns.length == entry.quorum) {
            entry.actionable = true
            var previous = this.log.findIter({ id: entry.id }).prev()
            if (previous && Id.compare(previous.id, entry.previous) == 0) {
                if (entry.internal) {
                    messages.push({
                        type: entry.value.type,
                        to: entry.value.to.slice(),
                        from: entry.value.from.slice(),
                        id: entry.id
                    })
                }
            }
        }
        if (entry.actionable && Id.compare(this.proposal.id, message.id) == 0) {
            messages.push({
                from: this.government.majority.slice(),
                to: this.government.majority.filter(function (id) {
                    return id != this.id
                }.bind(this)),
                type: 'learned',
                id: message.id
            })
            if (this.queue.next.value) {
                var next = this.queue.next
                next.prev.next = next.next
                next.next.prev = next.prev
                this.createProposal(next.value)
                this.accept()
            }
        }
    }, this)
    return messages
}

Legislator.prototype.receiveGovernment = function (message) {
    var entry = this.entry(message.id, {})
    this.government = entry.value.government
}

module.exports = Legislator
