function Learner (id) {
    this._id = id
}

Learner.prototype.reset = function (queue, common) {
    this._queue = queue
    this._common = common
    this.finalValue = null
    this.stateLog = {}
    this.finalProposalId = null
    this.proposals = {} // proposal ID -> [accept count, retain count, value]
    this.acceptors = {}
}

                                       // :: Int -> Int -> a ->
Learner.prototype.receiveAccepted = function (message) {
    var outcome = []

    if (this._common.finalValue != null) {
        return []
    }

/*
    var last = this.acceptors[proposal.from][1]
    if (last) {
        if (last > proposal.proposalId) { return outcome }
        this.acceptors[proposal.from][1] = proposal.proposalId
    }*/

    console.log(message)
    if (this.proposals[message.proposalId] == null) {
        this.proposals[message.proposalId] = [ 1, 1, message.value ]
    } else {
        this.proposals[message.proposalId][0] += 1
    }

    if (this.proposals[message.proposalId][0] == this._common.quorum) { // round over

        this._common.finalValue = message.value
        this._common.finalProposalId = message.proposalId

        outcome.push({
            eventType: 'consumed',
            proposal: message.value,
            proposalId: message.proposalId,
            leader: message.nodeId,
            roundOver: true,
        })
    }

    return outcome
}

module.exports = Learner
