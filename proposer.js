var Monotonic = require('monotonic').asString

function Proposer (government, promise, id) {
    this.state = 'preparing'
    this.government = government
    this.promise = Monotonic.increment(promise, 0)
    this.quorum = null
    this.id = id
}

Proposer.prototype.prepare = function (messages) {
    this.quorum = []
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
                if (!~this.quorum.indexOf(message.from)) {
                    this.quorum.push(message.from)
                }
            }
            if (this.quorum.length == Math.ceil(this.government.length / 2)) {
                this.state = 'accepting'
                this.quorum.forEach(function (id) {
                    messages.push({ to: id, method: 'accept' })
                }, this)
            }
        }
        break
    }
}

module.exports = Proposer
