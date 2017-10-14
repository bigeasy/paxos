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

// We do not need to handle accept messages.

// If we received an accept message it would mean that a proposer had a promise
// from this citizen but the Acceptor that issued the promise has been replaced
// by this recorder. That in turn means that we have received a new, stable
// government and that government has been written to the atomic log. Our atomic
// log is therefore ahead of the atomic log of the sender of the accept message
// so the request would have been rejected because the logs are out of sync.

// The previous promise of the registered entry submitted will match the
// registered entry recorder.

// This one is because our previous entry is always synonymous with what is in
// our atomic log. If we receive a message with a different previous entry then
// the atomic logs are out of sync and our whole algorithm has failed. If it is
// merely the case that we're getting a register message that was delayed or
// lost a race to write a recover fiat government, then the request would be
// rejected because the logs are out of sync.

//
Recorder.prototype.request = function (now, request) {
    assert(/^prepare|register$/.test(request.method), 'unexpected message to record')
    // Anything else is going to get caught synchronization and rejected.
    switch (request.method) {
    case 'prepare':
        return this._paxos._prepare(now, request)
    case 'register':
        assert(request.register.body.previous ==  this.register.body.promise, 'register has unexpected previous')
        assert(this._paxos.log.head.body.promise == this.register.body.promise, 'recorder and log out of sync')
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
