var Monotonic = require('./monotonic')

var Writer = require('./writer')

// TODO Convert from a government structure.
// TODO Really need to have the value for previous, which is the writer register.
class Proposer {
    constructor (paxos, promise) {
        this._paxos = paxos
        this.collapsed = true
        this.promise = Monotonic.increment(promise, 0)
        this.proposals = []
        this.register = {
            body: {
                promise: paxos.top.promise,
                body: paxos.top.body,
                previous: paxos.top.previous
            },
            previous: null
        }
        this.proposal = null
    }

    unshift (proposal) {
        this.proposal = proposal
    }

    nudge (now) {
        this.prepare(now)
    }

    prepare (now) {
        this._paxos._send({
            method: 'prepare',
            collapsible: true,
            constituent: false,
            to: this.proposal.quorum,
            promise: this.promise
        })
    }

    collapse (now, request, responses) {
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

    response (now, request, responses) {
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
                constituent: false,
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

    createWriter (promise) {
        return new Writer(this._paxos, promise, [])
    }

    inspect () {
        return {
            type: 'Proposer',
            promise: this.promise,
            register: this.register,
            proposal: this.proposal
        }
    }
}

module.exports = Proposer
