var Monotonic = require('monotonic').asString

var Writer = require('./writer')

// TODO Convert from a government structure.
// TODO Really need to have the value for previous, which is the writer register.
function Proposer (paxos, promise) {
    this._paxos = paxos
    this.collapsed = true
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
        collapsible: true,
        to: this.proposal.quorum,
        promise: this.promise
    })
}

Proposer.prototype.collapse = function (now, request, responses) {
    var promised = request.promise
    for (var i = 0, I = request.to.length; i < I; i++) {
        var response = responses[request.to[i]]
        if (Monotonic.compare(promised, response.message.promise) < 0) {
            promised = response.message.promise
        }
    }
    this.promise = Monotonic.increment(promised, 0)
    this._paxos._propose(now, true)
}

Proposer.prototype.response = function (now, request, responses) {
    switch (request.method) {
    case 'prepare':
        for (var id in responses) {
            if (
                Monotonic.compare(this.register.body.promise, responses[id].message.register.body.promise) < 0
            ) {
                this.register = responses[id].message.register
            }
        }
        this._paxos._send({
            method: 'accept',
            to: this.proposal.quorum,
            promise: request.promise,
            collapsible: true,
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
    return new Writer(this._paxos, promise, [])
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
