function Proposer (n) {
    this.proposal_num = n
    this.proposal = null
    this._promised = []
    this._acceptors = []
    this.prepared = 0
    this.value = null
}

Proposer.prototype.addAcceptor = function (acceptor) {
    this._acceptors.push(acceptor)
}

Proposer.prototype.prepare = function (proposal) {
    var i
    this.proposal = proposal

    for (i = 0; i < this._acceptors.length; i++) {
        var req = this._acceptors[i].prep(this.proposal_num, this)
        if (req.message === 'PROMISED') {
            this._promised.push(i)
        } else {
            this.proposal_num = req.highest_proposal_num + 1
            this.value = req.value
        }
    }
    if (this._promised.length > (this._promised.length / 2)) {
        propose()
    }
}

Proposer.prototype.propose = function () {
    for (var i in this._promised) {
        this.value = this._acceptors[i].accept(this.proposal, this)
    }
}

function Acceptor (n) {
    this.highest_proposal = n
    this.message = null
    this.learners = []
    this.promised = null
}

Acceptor.prototype.prep = function (n, value, sender) {
    if (n > this.highest_proposal) {
        this.highest_proposal_num = n
        this.promised = sender

        return {
            message: 'PROMISED'
        }

    } else {
        // send a not-so-success-y response
        // that includes this.highest_proposal
        return {
            message: 'NOT PROMISED',
            highest_proposal_num: this.highest_proposal_num
        }
    }
}

Acceptor.prototype.accept = function (value, sender) {
    //  ensure this is the sender we promised to wait for
    //  possible that another proposer could hijack our
    //  proposal number somehow
    if (this.promised == sender) {
        this.message = value
        this._send(value)
        return value
    } else {
        return this.message
    }

}

Acceptor.prototype.addLearner = function (learner) {
    this.learners.push(learner)
}

Acceptor.prototype._send = function (value) {
    this.learners.forEach(function (learner) {
        learner._set(value, this.highest_proposal_num)
    })
}

Acceptor.prototype._set = function (value, n) {
    this.promised = null
    this.message = value
    this.highest_proposal_num = n
}


exports.paxos = function (messages) {
}
