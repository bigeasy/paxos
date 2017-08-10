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
            this._paxos._commit(now, this.register)
            return { from: this.id, method: 'committed', promise: this.promise }
        }
        return { from: this.id, method: 'reject', promise: this.promise }
    }
}

Acceptor.prototype.createRecorder = function () {
    return new Recorder(this._paxos)
}

module.exports = Acceptor
