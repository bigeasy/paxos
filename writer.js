var assert = require('assert')

var Monotonic = require('monotonic').asString

function Writer (paxos, promise, proposals) {
    this._paxos = paxos
    this.collapsed = false
    this._previous = promise
    // This is the right data structure for the job. It is an array of proposals
    // that can have at most one proposals for a new government, where that
    // proposal is unshifted into the array and all the subsequent proposals
    // have their promises remapped to the new government.
    //
    // Returning to this, I felt that it made no sense, just push the new
    // governent onto the end of the array, but then you're moving toward scan
    // the array for an existing government to assert that it is not there, or
    // else queuing governments based on either the current government, or the
    // last future government pushed onto the proposal array.
    //
    // Although it's not multi-dimensional, I see this structure in my mind as
    // somehow ether dash shapped, an array of just proposals, or L shaped an
    // array of proposals with a new government unshifted.
    //
    // Sometimes there's a scout leader, and sometimes there's not.
    //
    // But, the array is the correct structure. It makes the remapping easy.
    //
    // Governments jumping the gun is the right way to go, and here's how we
    // prioritize them, by constantly unshifting only the next one onto the
    // array.
    //
    // This means that there is a queue of awaiting governments. It is, however,
    // implicit. We will review our current government when we create a new one,
    // and when a ping changes the reachable state of a constituent. Recall that
    // a new government is formed to immigrate or exile a citizen.
    //
    this.proposals = proposals
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
        to: proposal.quorum,
        collapsible: true,
        constituent: true,
        register: {
            body: {
                promise: proposal.promise,
                body: proposal.body,
                previous: this._previous
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

Writer.prototype.collapse = function (now) {
    this._paxos._collapse(now)
}

Writer.prototype.response = function (now, request, responses) {
    assert(request.method == 'register', 'unexpected request type')
    this._previous = request.register.body.promise
    this._paxos._register(now, request.register)
    this._writing = false
    if (this.proposals.length == 0) {
        this._paxos.scheduler.schedule(now, this._paxos.id, {
            method: 'synchronize',
            to: this._paxos.government.majority,
            collapsible: true
        })
    } else {
        this._send()
    }
}

Writer.prototype.createWriter = function (promise) {
    return new Writer(this._paxos, promise, this.proposals)
}

Writer.prototype.inspect = function () {
    return { type: 'Writer', proposals: this.proposals }
}

module.exports = Writer
