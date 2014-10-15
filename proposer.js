function Proposer (id, generateProposalId) { // :: a | num, function
    this.generateProposalId = generateProposalId || function () {
        return this._nextProposalId++
    }
    this._nextProposalId = 0
    this.id = id
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
    this.proposal = proposal
    this.currentStatus = 'proposal'

    if (this._leader) {
        return [{
            type: "accept",
            proposalId: this.proposalId,
            proposal: this.proposal
        }]
    } else {
        return this.prepare(false)
    }
}

Proposer.prototype.prepare = function (nack, seed) { // :: bool, int
    this.proposalId = arguments.length == 2 ? this.generateProposalId(seed)
                                            : this.generateProposalId()
    var messages = []
    if (nack) {
        messages.push({
            eventType: "NACK",
            newProposalId: this.proposalId
        })
    }
    messages.push({
        type: "prepare", nodeId: this.id, proposalId: this.proposalId
    })
    return messages
}

module.exports = Proposer
