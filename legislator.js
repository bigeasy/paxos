var Monotonic = require('monotonic')

function Legislator (government, promise, id) {
    this.promise = promise
    this.government = government
    this.id = id
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
    }
}

module.exports = Legislator
