var Monotonic = require('monotonic')

function Legislator (government, promise, id) {
    this.promise = promise
    this.government = government
    this.id = id
    this.accepted = null
    this.committed = false
}

Legislator.prototype.recieve = function (message, responses) {
    switch (message.method) {
    case 'prepare':
        if (Monotonic.compare(this.promise, message.promise) < 0) {
            this.promise = message.promise
            responses.push({ from: this.id, method: 'promise', promise: this.promise })
        } else {
            responses.push({ from: this.id, method: 'reject', promise: this.promise })
        }
        break
    case 'accept':
        if (Monotonic.compare(this.promise, message.promise) == 0) {
            this.accept = message.value
            responses.push({ from: this.id, method: 'accepted', promise: this.promise })
        } else {
            responses.push({ from: this.id, method: 'reject', promise: this.promise })
        }
        break
    case 'commit':
        if (Monotonic.compare(this.promise, message.promise) == 0) {
            this.committed = true
            responses.push({ from: this.id, method: 'committed', promise: this.promise })
        } else {
            responses.push({ from: this.id, method: 'reject', promise: this.promise })
        }
    }
}

module.exports = Legislator
