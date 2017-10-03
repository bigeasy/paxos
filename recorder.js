var assert = require('assert')
var Monotonic = require('monotonic').asString

// TODO Remember that the code is more complicated than the messaging. Let the
// messages absorb some of the complexity of the code. (Divide them. Restrict
// their structure.)

function Recorder (paxos) {
    var entry = paxos.log.head.body
    this.register = {
        body: {
            promise: entry.promise,
            body: entry.body,
            previous: entry.previous
        },
        previous: null
    }
    this._paxos = paxos
}

Recorder.prototype.request = function (now, request) {
    assert(/^prepare|register$/.test(request.method), 'unexpected message to record')
    // Anything else is going to get caught synchronization and rejected.
    switch (request.method) {
    case 'prepare':
        return this._paxos._prepare(now, request)
    case 'register':
        if (this._paxos.log.head.body.promise != request.register.body.previous) {
            return { method: 'reject', promise: '0/0' }
        }
        this.register = request.register
        return { method: 'receive', promise: '0/0' }
    }
}

Recorder.prototype.createRecorder = function () {
    return new Recorder(this._paxos)
}

Recorder.prototype.inspect = function () {
    return { type: 'Recorder' }
}

module.exports = Recorder
