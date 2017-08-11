var Recorder = require('./recorder')
var Monotonic = require('monotonic')

function Acceptor (promise, id, paxos) {
    this.promise = promise
    this.id = id
    this.register = null
    this._paxos = paxos
}

Acceptor.prototype.request = function (now, message) {
    switch (message.method) {
    case 'prepare':
        if (Monotonic.compare(this.promise, message.promise) < 0) {
            this.promise = message.promise
            return {
                method: 'promise',
                promise: this.promise,
                register: this.register
            }
        }
    case 'accept':
        if (Monotonic.compare(this.promise, message.promise) == 0) {
            this.register = {
                promise: message.promise,
                value: message.government,
                previous: message.previous
            }
            return { method: 'accepted', promise: this.promise }
        }
    case 'commit':
        if (Monotonic.compare(this.promise, message.promise) == 0) {
            this._paxos._commit(now, this.register)
            return { method: 'committed', promise: this.promise }
        }
    }
    return { method: 'reject', promise: this.promise }
}

Acceptor.prototype.createRecorder = function (promise) {
    return new Recorder(this._paxos, promise)
}

module.exports = Acceptor
