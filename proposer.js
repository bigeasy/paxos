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
            type: 'accept',
            proposalId: this._common.proposalId,
            proposal: this._common.proposal
        }]
    } else {
        return this.prepare(false)
    }
}

Proposer.prototype.prepare = function (nack) { // :: bool, int
    var messages = []

    // todo: Wrap.
    this._common.proposalId = this._nextProposalId++

    if (nack) {
        messages.push({
            eventType: 'NACK',
            newProposalId: this._common.proposalId
        })
    }

    messages.push({
        type: 'prepare',
        nodeId: this._id,
        proposalId: this._common.proposalId, round: this._common.round
    })

    return messages
}

Proposer.prototype.receivePromise = function (message) {

    if (message.round < this._common.round) {
        return []
    }

    if (message.proposalId != this._common.proposalId) {
        return []
    }
    console.log('called!')

//    if (this._common.acceptors[message.id] == null) {
//        return []
//    }

    if (this._common.promises.indexOf(message.nodeId) < 0) {
        this._common.promises.push(message.nodeId)
    } else {
        // We have already received a promise. Something is probably wrong.
        return []
    }

    if (message.lastAcceptedId > this._common.lastAcceptedId) {
        this._common.lastAcceptedId = lastAcceptedId
        if (message.lastValue) {
            this._common.proposal = message.lastValue
        }
    }

    if (this._common.promises.length >= this._common.quorum) {
        if (this._common.proposal) {
            return [{
                type: 'accept',
                round: this._common.round,
                proposalId: this._common.proposalId,
                proposal: this._common.proposal,
                roundOver: false
            }]
        }
    }

    return []
}

module.exports = Proposer
