function Learner (id) {
    this._id = id
}

Learner.prototype.reset = function (queue, common) {
    this.queue = queue
    this.common = common
    this.finalValue = null
    this.stateLog = {}
    this.finalProposalId = null
    this.proposals = {} // proposal ID -> [accept count, retain count, value]
    this.acceptors = {}
}
                                       // :: Int -> Int -> a ->
Learner.prototype.receiveAccept = function (proposal) {
    var outcome = []

    if (this.finalValue != null) {
        return outcome
    }

    var last = this.acceptors[proposal.from][1]
    if (last) {
        if (last > proposal.proposalId) { return outcome }
        this.acceptors[proposal.from][1] = proposal.proposalId
    }

    if (this.proposals[proposal.proposalId] == null) {
        this.proposals[proposal.proposalId] = [ 1, 1, proposal.acceptedValue ]
    } else {
        this.proposals[proposal.proposalId][0] += 1
    }

    if (this.proposals[proposal.proposalId][0] == this.quorum) { // round over

        this.finalValue = proposal.acceptedValue
        this.finalProposalId = proposal.proposalId

        outcome.push({
            eventType: "accepted",
            proposal: proposal.acceptedValue,
            proposalId: proposal.proposalId,
            leader: proposal.from,
            roundOver: true,
        })
    }

    return outcome
}

module.exports = Learner
