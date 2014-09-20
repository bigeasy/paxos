function Proposer (generateProposalId) {
    this.generateProposalId = generateProposalId || function () {
        return this._nextProposalId++
    }
    this._nextProposalId = 0
    this.proposalId = null
    this.lastAcceptedId = null
    this.history = {}
    this.promises = []
    this.nextProposalNum = 1
    this.leader = null
}

Proposer.prototype.startProposal = function (proposal) { // :: a -> function ->
    this.promises = []
    this.accepts = []
    this.proposal = proposal
    this.currentStatus = 'proposal'

    if (callback) {
        node.callback = callback
    }

    if (node.leader) {
        return [{
            type: "accept",
            proposalId: this.proposalId,
            proposal: this.proposal
        }]
    } else {
        return node.prepare(false)
    }
}

Proposer.prototype.prepare = function (nack, seed) { // :: bool, int
    this.proposalId = arguments.length == 2 ? node.generateProposalId(seed)
                                            : node.generateProposalId()
    if (nack) {
        if (node.callback) {
            node.callback({
                eventType: "NACK",
                newProposalId: node.proposalId
            })
        }
    }
    return [{
        type: "prepare", nodeId: this.id, proposalId: this.proposalId
    }]
}

exports.Proposer = Proposer
