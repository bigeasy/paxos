function Proposer (id) {
    this._id = id
}

Proposer.prototype.reset = function (queue, common) {
    this._queue = queue
    this._common = common
    this._nextProposalId = 1
    this.proposalId = null
    this.lastAcceptedId = null
    this.history = {}
    this.promises = []
    this.nextProposalNum = 1
    this.leader = null
}

Proposer.prototype.startProposal = function (proposal) { // :: a
    this.promises = []
    this.accepts = []
    this._common.proposal = proposal
    this._common.status = 'proposal'

    if (this._leader) {
        return [{
            type: "accept",
            proposalId: this.proposalId,
            proposal: this._common.proposal
        }]
    } else {
        return this.prepare(false)
    }
}

Proposer.prototype.prepare = function (nack) { // :: bool, int
    var messages = []

    // todo: Wrap.
    this.proposalId = this._nextProposalId++

    if (nack) {
        messages.push({
            eventType: "NACK",
            newProposalId: this.proposalId
        })
    }

    messages.push({
        type: "prepare", nodeId: this._id, proposalId: this.proposalId
    })

    return messages
}

module.exports = Proposer
