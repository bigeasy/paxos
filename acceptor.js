var Monotonic = require('monotonic')

function Legislator (promise, id, paxos) {
    this.promise = promise
    this.id = id
    this.register = null
    this.paxos = paxos
}

Legislator.prototype.request = function (now, message) {
    switch (message.method) {
    case 'prepare':
        if (Monotonic.compare(this.promise, message.promise) < 0) {
            this.promise = message.promise
            return {
                from: this.id,
                method: 'promise',
                promise: this.promise,
                register: this.register
            }
        }
        return { from: this.id, method: 'reject', promise: this.promise }
    case 'accept':
        if (Monotonic.compare(this.promise, message.promise) == 0) {
            this.register = {
                promise: message.promise,
                value: message.government,
                previous: message.previous
            }
            return { from: this.id, method: 'accepted', promise: this.promise }
        }
        return { from: this.id, method: 'reject', promise: this.promise }
    case 'commit':
        if (Monotonic.compare(this.promise, message.promise) == 0) {
            this.paxos._commit(now, this.register)
            return { from: this.id, method: 'committed', promise: this.promise }
        }
        return { from: this.id, method: 'reject', promise: this.promise }
    }
}

module.exports = Legislator
