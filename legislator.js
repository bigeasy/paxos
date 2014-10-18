var assert = require('assert')
var Id = require('./identifier')
var push = [].push
var RBTree = require('bintrees').RBTree;

function Legislator (id) {
    this.id = id
    this.proposal = { id: [ 0x0 ] }
    this.promisedId = [ 0x1 ]
    this.log = new RBTree(function (a, b) { return Id.compare(a.id, b.id) })
}

Legislator.dispatch = function (messages, legislators) {
    var responses = []
    messages.forEach(function (message) {
        var type = message.type
        var method = 'receive' + type[0].toUpperCase() + type.substring(1)
        legislators.forEach(function (legislator) {
            if (!message.to || ~message.to.indexOf(legislator.id)) {
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
        if (!message.to) {
            responses.push(message)
        }
    })
    return responses
}

Legislator.prototype.propose = function (value) {
    // assert(~this.quorum.indexOf(this.id), 'quorom includes self')
    this.proposal = {
        id: Id.increment(this.proposal.id),
        value: value,
        quorum: this.quorum.slice(),
        promises: [],
        accepts: []
    }
    this.promisedId = this.proposal.id
    // todo: pass around quorum?
    return [{
        from: this.id,
        to: this.proposal.quorum,
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
            from: this.id,
            to: [ message.from ],
            type: 'promise',
            id: this.promise.id
        }]
    }

    return [{
        from: this.id,
        to: [ message.from ],
        type: 'promised',
        id: this.promisedId
    }]
}

Legislator.prototype.receivePromise = function (message) {
    var compare = Id.compare(this.proposal.id, message.id)

    if (compare != 0) {
        return []
    }

    if (!~this.proposal.quorum.indexOf(message.from)) {
        return []
    }

    if (!~this.proposal.promises.indexOf(message.from)) {
        this.proposal.promises.push(message.from)
    } else {
        // We have already received a promise. Something is probably wrong.
        return []
    }

    if (this.proposal.promises.length == this.proposal.quorum.length - 1) {
        return [{
            from: this.id,
            to: [ this.proposal.quorum[1] ],
            forward: this.proposal.quorum.slice(2),
            type: 'accept',
            quorum: this.quorum.length,
            id: this.proposal.id,
            value: this.proposal.value,
        }]
    }

    return []
}

Legislator.prototype._entry = function (id) {
    var entry = this.log.find({ id: id })
    if (!entry) {
        var entry = { id: id, accepts: [] }
        this.log.insert(entry)
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
        var entry = this._entry(message.id)
        entry.value = message.value
        return [{
            type: 'accepted',
            quorum: message.quorum,
            from: this.id,
            id: message.id,
            value: message.value
        }]
    }
}

Legislator.prototype.receiveAccepted = function (message) {
    var entry = this._entry(message.id)
    if (!~entry.accepts.indexOf(message.from)) {
        entry.accepts.push(message.from)
    }
    if (!entry.value) {
        entry.value = message.value
    }
    if (!entry.quorum) {
        entry.quorum = message.quorum
    }
    if (entry.accepts.length >= entry.quorum) {
        entry.learned = true
    }
    if (Id.compare(this.proposal.id, message.id) == 0) {
        if (!~this.proposal.accepts.indexOf(message.from)) {
            this.proposal.accepts.push(message.from)
        }
        if (this.proposal.accepts.length == this.proposal.quorum.length - 1) {
            if (!~entry.accepts.indexOf(this.id)) {
                entry.accepts.push(this.id)
                entry.learned = true
                return this.quorum.map(function (id) {
                    return {
                        from: id,
                        to: this.quorum.slice(),
                        type: 'accepted',
                        quorum: this.quorum.length,
                        id: this.proposal.id,
                        value: this.proposal.value,
                    }
                }.bind(this))
            }
        }
    }
    return []
}

module.exports = Legislator
