var Monotonic = require('monotonic')

function Legislator (promise, id) {
    this.promise = promise
    this.id = id
    this.accepted = null
    this.committed = false
}

Legislator.prototype.receive = function (message, responses) {
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
            this.accepted = message.value
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
