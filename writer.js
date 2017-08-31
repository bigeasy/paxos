var assert = require('assert')

var Monotonic = require('monotonic').asString

function Writer (paxos, promise) {
    this._paxos = paxos
    this.version = [ promise, this.collapsed = false ]
    this.proposals = []
    this._writing = false
}

Writer.prototype.push = function (proposal) {
    this.proposals.push({
        quorum: proposal.quorum,
        promise: proposal.promise,
        body: proposal.body
    })
}

Writer.prototype.unshift = function (proposal) {
    this.proposals.unshift({
        quorum: proposal.quorum,
        promise: proposal.promise,
        body: proposal.body
    })
}

Writer.prototype._send = function () {
    var proposal = this.proposals.shift()
    this._writing = true
    this._paxos._send({
        method: 'register',
        version: this.version,
        to: proposal.quorum,
        register: {
            body: {
                promise: proposal.promise,
                body: proposal.body,
                previous: this._paxos.log.head.body.promise
            },
            previous: null
        }
    })
}

Writer.prototype.nudge = function () {
    if (!this._writing && this.proposals.length != 0) {
        this._send()
    }
}

Writer.prototype.response = function (now, request, responses, promise) {
    assert(request.method == 'register', 'unexpected request type')
    if (promise != null) {
        this._paxos.collapse(now)
    } else {
        this._paxos._commit(now, request.register)
        this._writing = false
        if (this.proposals.length == 0) {
            this._paxos.scheduler.schedule(now, this._paxos.id, {
                method: 'synchronize',
                to: this._paxos.government.majority
            })
        } else {
            this._send()
        }
    }
}

Writer.prototype.createWriter = function () {
    return this
}

module.exports = Writer
