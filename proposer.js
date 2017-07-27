var assert = require('assert')

var Monotonic = require('monotonic').asString

// TODO Convert from a government structure.
function Proposer (government, promise) {
    this.state = 'preparing'
    this.government = government
    this.promise = Monotonic.increment(promise, 0)
    this.promised = null
    this.accepted = null
    this.committed = null
}

Proposer.prototype.prepare = function (messages) {
    this.promised = []
    this.accepted = []
    this.committed = []
    this.government.forEach(function (denizen) {
        messages.push({
            to: denizen,
            method: 'prepare',
            promise: this.promise
        })
    }, this)
}

Proposer.prototype.recieve = function (message, messages) {
    switch (message.method) {
    case 'promise':
        if (this.state == 'preparing') {
            if (message.promise == this.promise) {
                assert(!~this.promised.indexOf(message.from))
                this.promised.push(message.from)
            }
            if (this.promised.length == Math.ceil(this.government.length / 2)) {
                // If we have a quorum we move to the accept state.
                this.state = 'accepting'
                // The first element in the government is the our node id. We
                // want to become the leader of the government we're proposing.
                // To do so we reorder our quorum based on the order of the
                // government array provided.
                var promised = this.promised
                var majority = this.government.filter(function (id) {
                    return ~promised.indexOf(id)
                })
                var minority = this.government.filter(function (id) {
                    return !~majority.indexOf(id)
                })
                majority.forEach(function (id) {
                    messages.push({
                        to: id,
                        method: 'accept',
                        promise: this.promise,
                        value: { majority: majority, minority: minority }
                    })
                }, this)
            }
        }
        break
    case 'accepted':
        if (this.state == 'accepting') {
            if (message.promise == this.promise) {
                assert(!~this.accepted.indexOf(message.from))
                this.accepted.push(message.from)
            }
            if (this.accepted.length == this.promised.length) {
                this.state = 'committing'
                this.promised.forEach(function (id) {
                    messages.push({
                        to: id,
                        method: 'commit',
                        promise: this.promise
                    })
                }, this)
            }
        }
        break
    case 'committed':
        if (this.state == 'committing') {
            if (message.promise == this.promise) {
                assert(!~this.committed.indexOf(message.from))
                this.committed.push(message.from)
            }
            if (this.committed.length == this.accepted.length) {
                this.state = 'committed'
            }
        }
        break
    }
}

module.exports = Proposer
