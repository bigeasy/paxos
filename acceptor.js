var Recorder = require('./recorder')
var Monotonic = require('monotonic')

function Acceptor (paxos) {
    this.register = null
    this._paxos = paxos
}

Acceptor.prototype.request = function (now, message, sync) {
    switch (message.method) {
    case 'prepare':
        if (Monotonic.compare(this._paxos.promise, message.promise) < 0) {
            this._paxos.promise = message.promise
            return {
                method: 'promise',
                promise: this._paxos.promise,
                register: this.register,
                sync: sync
            }
        }
    case 'accept':
        if (Monotonic.compare(this._paxos.promise, message.promise) == 0) {
            this.register = {
                promise: message.promise,
                value: message.government,
                previous: message.previous
            }
            return { method: 'accepted', promise: this._paxos.promise, sync: sync }
        }
    case 'commit':
        if (Monotonic.compare(this._paxos.promise, message.promise) == 0) {
            this._paxos._commit(now, this.register)
            return { method: 'committed', promise: this._paxos.promise, sync: sync }
        }
    }
    return { method: 'reject', promise: this._paxos.promise, sync: sync }
}

Acceptor.prototype.createRecorder = function (promise) {
    return new Recorder(this._paxos, promise)
}

module.exports = Acceptor
