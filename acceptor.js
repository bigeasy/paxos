var Recorder = require('./recorder')
var Monotonic = require('./monotonic')

class Acceptor {
    constructor (paxos) {
        this.register = paxos._writer.register || {
            body: paxos.top.body,
            previous: null
        }
        this.promise = paxos.top.body.promise
        this._paxos = paxos
    }

    request (now, message) {
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

    createRecorder (promise) {
        var entries = [], register = this.register
        while (register) {
            entries.push(register.body)
            register = register.previous
        }

        entries.reverse()

        for (var i = 1, I = entries.length - 1; i < I; i++) {
            if (entries[i].promise == promise) {
                return this
            }
        }

        // TODO Does it matter if the promise is off? Or only register contents?
        return new Recorder(this._paxos)
    }

    inspect () {
        return { type: 'Acceptor', register: this.register }
    }
}

module.exports = Acceptor
