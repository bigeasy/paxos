function Acceptor (id) {
    this._id = id
}

Acceptor.prototype.reset = function (queue, common) {
    this._queue = queue
    this._common = common
}

Acceptor.prototype.receivePrepare = function (message) {

    if (message.round < this._common.round) {
        return []
    }

    if (message.proposalId == this._common.promisedId) {
        return []
    }

    var messages = []

    if (message.proposalId > this._common.promisedId) {
        this._common.promisedId = message.proposalId
        messages.push({
            type: "promise",
            proposalId: this._common.promisedId,
            lastValue: this._common.lastAccepted,
            lastAcceptedId: this._common.lastAcceptedId,
            round: this._common.round,
            nodeId: this._common.id,
            participantId: this._id
        })
    } else {
        messages.push({
            type: "promised",
            round: this._current.currentRound,
            proposalId: this._current.proposalId,
        })
    }

    return messages
}

Acceptor.prototype.receiveAccept = function (message) {
    if (message.round < this._common.round) {
        return []
    }

    var messages = []

    // FIXME: removed something to do with leaders.
    if (message.proposalId == this._common.promisedId || message.roundOver) {
        this._common.promisedId = message.proposalId
        this._common.acceptedId = message.proposalId
        this._common.value = message.proposal
        messages.push({
            type: "accepted",
            round: this._common.round,
            proposalId: message.proposalId,
            value: message.proposal
        })
        this._common.leader = message.nodeId
        this._common.stateLog[this._common.round] = {
            round: this._common.round,
            value: message.proposal,
            time: Date.now(),
            leader: message.nodeId,
            proposalId: message.proposalId
        }

        this._common.round++
    } else if (message.proposalId < this._common.promisedId) {
        messages.push({
            type: 'accepted',
            round: this._common.round,
            proposalId: message.proposalId,
            proposal: message.proposal
        })
    } else {
        console.log(this._common, message)
        messages.push({
            type: "NACK",
            highestProposalNum: this._common.promisedId
        })
    }

    return messages
}

module.exports = Acceptor
