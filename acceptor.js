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
                previous: this.register,
                sync: sync
            }
        }
    case 'accept':
        if (Monotonic.compare(this._paxos.promise, message.promise) == 0) {
            this.register = {
                promise: message.promise,
                body: message.body,
                previous: message.previous
            }
            return { method: 'accepted', promise: this._paxos.promise, sync: sync }
        }
    }
    return { method: 'reject', promise: this._paxos.promise, sync: sync }
}

Acceptor.prototype.createRecorder = function () {
    if (this._paxos.log.head.body.body.promise == this.promise) {
        return new Recorder(this._paxos)
    }
    return this
}

module.exports = Acceptor
