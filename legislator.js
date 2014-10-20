var assert = require('assert')
var Id = require('monotonic')
var push = [].push
var RBTree = require('bintrees').RBTree;

function Legislator (id) {
    this.id = id
    this.proposal = { id: [ 0x0 ] }
    this.promisedId = [ 0x1 ]
    this.log = new RBTree(function (a, b) { return Id.compare(a.id, b.id) })
    this.government = {
        leader: 0,
        majority: [ 0, 1, 2 ],
        members: [ 0, 1, 2, 3, 4 ]
    }
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
                if (message.forward) { // todo: validator.forward(message)
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

Legislator.prototype.propose = function (value) {
    // assert(~this.quorum.indexOf(this.id), 'quorom includes self')
    this.proposal = {
        id: Id.increment(this.proposal.id),
        value: value,
        quorum: this.government.majority.slice(),
        promises: [],
        accepts: []
    }
    this.promisedId = this.proposal.id
    // todo: pass around quorum?
    return [{
        from: [ this.id ],
        to: this.government.majority.slice(),
        type: 'prepare',
        id: this.proposal.id
    }]
}

Legislator.prototype.receivePrepare = function (message) {
    var compare = Id.compare(this.proposal.id, message.id)

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

        if (this.proposal.promises.length == this.proposal.quorum.length - 1) {
            this._entry(this.proposal.id, {
                quorum: this.government.majority.length,
                value: this.proposal.value
            })
            return [{
                from: [ this.id ],
                to: [ this.proposal.quorum[1] ],
                forward: this.proposal.quorum.slice(2),
                type: 'accept',
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

        return []
    }.bind(this)))
}

Legislator.prototype._entry = function (id, message) {
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
    if (entry.quorum == null && message.quorum != null) {
        entry.quorum = message.quorum
    }
    if (entry.value == null && message.value != null) {
        entry.value = message.value
    }
    return entry
}

Legislator.prototype.receiveAccept = function (message) {
    var compare = Id.compare(this.promisedId, message.id)
    if (compare > 0) {
        return [{
            type: 'reject'
        }]
    } else if (compare < 0) {
    } else {
        this._entry(message.id, message)
        return [{
            type: 'accepted',
            from: [ this.id ],
            to: this.government.majority.slice(),
            id: message.id
        }]
    }
}

Legislator.prototype.receiveAccepted = function (message) {
    var entry = this._entry(message.id, message), messages = []
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
    var entry = this._entry(message.id, message), messages = []
    message.from.forEach(function (id) {
        if (!~entry.learns.indexOf(id)) {
            entry.learns.push(id)
        }
        if (entry.learns.length == entry.quorum) {
            entry.actionable = true
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
        }
    }, this)
    return messages
}

Legislator.prototype.recieveDequeue = function (message) {
}

module.exports = Legislator
