function Acceptor () {
}

Acceptor.prototype.reset = function (node) {
    this.node = node
}

Acceptor.prototype.receivePrepare = function (message) {
    var messages = []

    if (message.round >= this._common.round && message.proposalId != this._common.proposalId) {
        if (message.proposalId > this._common.promisedId) {
            this._common.promisedId = message.proposalId
            messages.push({
                type: "promise",
                proposalId: this._common.promisedId,
                lastValue: this._common.lastAccepted,
                lastAcceptedId: this._common.lastAcceptedId,
                address: this.address,
                round: this._common.currentRound,
                nodeId: this._common.id,
                participantId: this.id
            })
        } else {
            messages.push({
                type: "promised",
                round: this._current.currentRound,
                proposalId: this._current.proposalId,
            })
        }
    }

    return messages
}

module.exports = Acceptor
