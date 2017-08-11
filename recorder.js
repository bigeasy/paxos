var assert = require('assert')
var Monotonic = require('monotonic').asString

// TODO Remember that the code is more complicated than the messaging. Let the
// messages absorb some of the complexity of the code. (Divide them. Restrict
// their structure.)

function Recorder (paxos, promise) {
    this._paxos = paxos
    this._promise = promise
    this._register = null
}

Recorder.prototype.request = function (now, request) {
    for (var i = 0, message; (message = request.messages[i]) != null; i++) {
        switch (message.method) {
        case 'write':
            if (
                Monotonic.increment(this._promise, 0) != message.promise &&
                Monotonic.increment(this._promise, 1) != message.promise
            ) {
                return { method: 'reject', promise: '0/0' }
            }
            if (this._register != null) {
                return { method: 'reject', promise: '0/0' }
            }
            this._register = {
                promise: this._promise = message.promise,
                body: message.body
            }
            break
        case 'commit':
            if (this._register.promise != message.promise) {
                return { method: 'reject', promise: '0/0' }
            }
            var register = [ this._register, this._register = null ][0]
            this._paxos._commit(now, {
                promise: register.promise,
                body: register.body,
                previous: null
            })
            break
        }
    }
    return { method: 'response', promise: '0/0' }
}

Recorder.prototype.createRecorder = function () {
    return this
}

module.exports = Recorder
