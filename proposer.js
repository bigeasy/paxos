var Monotonic = require('monotonic').asString

var Writer = require('./writer')

// TODO Convert from a government structure.
// TODO Really need to have the value for previous, which is the writer register.
function Proposer (paxos, promise) {
    this._paxos = paxos
    this.version = [ promise, this.collapsed = true ]
    this.promise = Monotonic.increment(promise, 0)
    this.proposals = []
    this.register = {
        body: {
            promise: paxos.log.head.body.promise,
            body: paxos.log.head.body.body,
            previous: paxos.log.head.body.previous
        },
        previous: null
    }
    this.proposal = null
}

Proposer.prototype.unshift = function (proposal) {
    this.proposal = proposal
}

Proposer.prototype.nudge = function (now) {
    this.prepare(now)
}

Proposer.prototype.prepare = function (now) {
    this._paxos._send({
        method: 'prepare',
        version: this.version,
        to: this.proposal.quorum,
        promise: this.promise
    })
}

Proposer.prototype.response = function (now, request, responses) {
    var promised = request.promise, failed = false
    for (var i = 0, I = request.to.length; i < I; i++) {
        var response = responses[request.to[i]]
        if (Monotonic.compare(promised, response.message.promise) < 0) {
            promised = response.message.promise
        }
        if (response.message.method == 'unreachable' || response.message.method == 'reject') {
            failed = true
        }
    }
    switch (failed || request.method) {
    case true:
        this.promise = Monotonic.increment(promised, 0)
        this._paxos._propose(now, true)
        break
    case 'prepare':
        for (var id in responses) {
            if (Monotonic.compare(this.register.body.promise, responses[id].message.register.body.promise) < 0) {
                this.register = responses[id].message.register
            }
        }
        this._paxos._send({
            method: 'accept',
            version: this.version,
            to: this.proposal.quorum,
            promise: request.promise,
            body: {
                promise: request.promise,
                body: this.proposal.body,
                previous: this.register.body.promise
            },
            previous: this.register
        })
        break
    case 'accept':
        this._paxos._register(now, request)
        break
    }
}

Proposer.prototype.createWriter = function (promise) {
    return new Writer(this._paxos, promise)
}

Proposer.prototype.inspect = function () {
    return {
        type: 'Proposer',
        promise: this.promise,
        register: this.register,
        proposal: this.proposal
    }
}

module.exports = Proposer
