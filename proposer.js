var assert = require('assert')

var Monotonic = require('monotonic').asString

// TODO Convert from a government structure.
function Proposer (paxos, government, promise) {
    this.version = [ promise, this.collapsed = true ]
    this.state = 'preparing'
    this.government = government
    this.promise = Monotonic.increment(promise, 0)
    this.previous = null
    this._paxos = paxos
}

Proposer.prototype.prepare = function (now) {
    this._paxos._send({
        method: 'prepare',
        to: this.government.majority,
        sync: [],
        promise: this.promise
    })
}

function getPromise (object) {
    return object == null ? '0/0' : object.promise
}

Proposer.prototype.response = function (now, pulse, responses) {
    var method = pulse.method
    for (var id in responses) {
        if (responses[id] == null) {
            method = 'failed'
        } else if (responses[id].method == 'reject') {
            method = 'failed'
            if (Monotonic.compare(this.promise, responses[id].promise) < 0) {
                this.promise = responses[id].promise
            }
        }
    }
    switch (method) {
    case 'failed':
        break
    case 'prepare':
        for (var id in responses) {
            if (Monotonic.compare(getPromise(this.previous), getPromise(responses[id].register)) < 0) {
                this.previous = responses[id].register
            }
        }
        this._paxos._send({
            method: 'accept',
            to: this.government.majority,
            sync: [],
            promise: this.promise,
            government: this.government,
            previous: this.previous
        })
        break
    case 'accept':
        this._paxos._send({
            method: 'commit',
            to: this.government.majority,
            sync: [],
            promise: this.promise
        })
        break
    case 'commit':
        break
    }
}

Proposer.prototype.createWriter = function (promise) {
    return new Writer(this._paxos, promise)
}

module.exports = Proposer
