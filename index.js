function Proposer (n, id) {
    this.id = id
    this.proposal_num = n
    this.proposal = null
    this._promised = []
    this._acceptors = []
    this.prepared = 0
    this.value = null
}

Proposer.prototype.addAcceptors = function (acceptors) {
    acceptors.forEach(function (acceptor) {
        this._acceptors.push(acceptor)
    }, this)
}

Proposer.prototype.send = function (proposal) {
    var i
    this.proposal = proposal

    for (i = 0; i < this._acceptors.length; i++) {
        var req = this._acceptors[i].prep(this.proposal_num, proposal, this.id)
        if (req.message === 'PROMISED') {
            this._promised.push(i)
        } else if(req.message === 'NOT PROMISED') {
            this.value = req.value
            this.proposal = req.value
        } else {
            this.proposal_num = req.highest_proposal_num + 1
            this.value = req.value
        }
    }
    if (this._promised.length > (this._acceptors.length / 2)) {
        //If we have promises from the majority of acceptors,
        //finish the proposal.
        this.propose()
    }
}

Proposer.prototype.propose = function () {
    for (var i in this._promised) {
        this.value = this._acceptors[i].accept(this.proposal, this.id)
        this._promised.splice(i, 1)
        this.proposal_num += 1
    }
}

function Acceptor (n, id) {
    this.id = id
    this.highest_proposal_num = n
    this.message = null
    this.learners = []
    this.promised = null
}

Acceptor.prototype.prep = function (n, value, sender) {
    if (n > this.highest_proposal_num && this.message == null) {
        this.highest_proposal_num = n
        this.promised = sender

        return {
            message: 'PROMISED'
        }

    } else if (n > this.highest_proposal_num) {
        // send a not-so-success-y response
        // that includes this.highest_proposal
        // and the current accepted message
        return {
            message: 'NOT PROMISED',
            highest_proposal_num: this.highest_proposal_num,
            value: this.message
        }
    } else {
        return {
            message: 'REJECTED',
            highest_proposal_num: this.highest_proposal_num,
            value: this.message
        }
    }
}

Acceptor.prototype.accept = function (value, sender) {
    //  ensure this is the sender we promised to wait for.
    //  Possible that another proposer could hijack our
    //  proposal number somehow
    if (this.promised == sender) {
        console.log(this.id + ' accepted ' + value)
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
    }, this)
}

Acceptor.prototype._set = function (value, n) {
    console.log(this.id + ' accepted ' + value)
    this.promised = null
    this.message = value
    this.highest_proposal_num = n
}


exports.paxos = function (messages) {
    var proposer = new Proposer(1, 100), acceptor = new Acceptor(0, 1)
    var proposer2 = new Proposer(2, 200), acceptor2 = new Acceptor(0, 2)
    proposer.addAcceptors( [ acceptor, acceptor2 ] )
    proposer2.addAcceptors( [ acceptor, acceptor2 ] )

    acceptor.addLearner(acceptor2)

    messages.forEach(function (message) {
        proposer2.send(message)
        proposer.send(message)
    })

    return acceptor2.message
}
