var Recorder = require('./recorder')
var Monotonic = require('monotonic').asString

function Acceptor (paxos) {
    this.register = paxos._writer.register || {
        body: paxos.log.head.body,
        previous: null
    }
    this.promise = paxos.log.head.body.promise
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
        break
    case 'accept':
        if (Monotonic.compare(this.promise, message.body.promise) == 0) {
            var register = {
                body: message.body,
                previous: message.previous
            }
            this.register = register
            this.promise = register.body.promise
            return { method: 'accepted', promise: this.promise }
        }
        break
    }
    return { method: 'reject', promise: this.promise }
}

Acceptor.prototype.createRecorder = function (promise) {
    var entries = [], register = this.register
    while (register) {
        entries.push(register.body)
        register = register.previous
    }

    entries.reverse()

    var found = false
    for (var i = 1, I = entries.length - 1; !found && i < I; i++) {
        found = entries[i].promise == promise
    }

    // TODO Does it matter if the promise is off? Or only register contents?
    if (!found) {
        return new Recorder(this._paxos)
    }

    return this
}

Acceptor.prototype.inspect = function () {
    return { type: 'Acceptor', register: this.register }
}

module.exports = Acceptor
