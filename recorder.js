var assert = require('assert')
var Monotonic = require('monotonic').asString

// TODO Remember that the code is more complicated than the messaging. Let the
// messages absorb some of the complexity of the code. (Divide them. Restrict
// their structure.)

function Recorder (paxos) {
    this._paxos = paxos
    this._register = null
}

Recorder.prototype.request = function (now, request, sync) {
    switch (request.method) {
    case 'prepare':
        var Acceptor = require('./acceptor')
        this._paxos._recorder = new Acceptor(this._paxos)
        return this._paxos._recorder.request(now, request, sync)
    case 'write':
        for (var i = 0, message; (message = request.messages[i]) != null; i++) {
            switch (message.method) {
            case 'write':
                if (
                    Monotonic.increment(this._paxos.promise, 0) != message.promise &&
                    Monotonic.increment(this._paxos.promise, 1) != message.promise
                ) {
                    return { method: 'reject', promise: '0/0', sync: sync }
                }
                if (this._register != null) {
                    return { method: 'reject', promise: '0/0', sync: sync }
                }
                this._register = {
                    promise: this._paxos.promise = message.promise,
                    body: message.body
                }
                break
            case 'commit':
                if (this._register.promise != message.promise) {
                    return { method: 'reject', promise: '0/0', sync: sync }
                }
                var register = [ this._register, this._register = null ][0]
                this._paxos._commit(now, {
                    promise: register.promise,
                    body: register.body,
                    previous: null
                })
                sync.committed = register.promise
                break
            }
        }
        return { method: 'response', promise: '0/0', sync: sync }
    default:
        return { method: 'reject', promise: '0/0', sync: sync }
    }
}

Recorder.prototype.createRecorder = function () {
    return this
}

module.exports = Recorder
