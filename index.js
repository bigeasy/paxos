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
    // Send a 'prepare' request to all acceptors.
        var req = this._acceptors[i].prep({
            proposal_num: this.proposal_num,
            sender: this.id
        })

        if (req.message === 'PROMISED') {
        // If we get a promise back, record the index so we can
        // send an 'accept' request later.
            this._promised.push(i)
        } else if (req.message === 'NOT PROMISED') {
        // A value is already decided, so save it.
            this.value = req.value
            if (req.value !== null) this.proposal = req.value
        } else {
        // Rejection - the acceptor has seen a higher proposal
        // number. Keep the value, we can try again.
            this.proposal_num = req.highest_proposal_num + 1
            this.value = req.value
        }
    }
    if (this._promised.length > (this._acceptors.length / 2)) {
        // If we have promises the majority of acceptors,
        // finish the proposal.
        this.propose()
    }
}

Proposer.prototype.propose = function () {
    // Send an 'accept' request to each promised acceptor
    this._promised.forEach(function (i) {
        this.value = this._acceptors[i].accept( { value: this.proposal, sender: this.id } )
        this.proposal_num += 1
    }, this)
    this._promised = []
}

function Acceptor (n, id) {
    this.id = id
    this.highest_proposal_num = n
    this.message = null
    this.learners = []
    this.promised = null
    this.locked = false
}

Acceptor.prototype.prep = function (request) {
    if (request.proposal_num > this.highest_proposal_num && !this.locked) {
        // This is the highest we've seen. Promise it.
        this.highest_proposal_num = request.proposal_num
        this.promised = request.sender
        console.log(this.id + ' promised ' + request.sender)
        this.locked = true

        return {
            message: 'PROMISED'
        }

    } else if (request.proposal_num > this.highest_proposal_num) {
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

Acceptor.prototype.accept = function (request) {
    //  ensure this is the sender we promised to wait for.
    //  Possible that another proposer could hijack our
    //  proposal number somehow
    if (this.promised == request.sender) {
        console.log(this.id + ' accepted ' + request.value)
        this.message = request.value
        this._send(request.value)
        return request.value
    } else {
        return this.message
    }

}

Acceptor.prototype.unlock = function (who) {
    // We might want to run again.
    this.locked = false
    if (who && who === 'all') {
        this.learners.forEach(function (learner) {
            learner.unlock()
        })
    }
}

Acceptor.prototype.addLearners = function (learners) {
    learners.forEach(function (learner) {
        this.learners.push(learner)
    }, this)
}

Acceptor.prototype._send = function (value) {
    this.learners.forEach(function (learner) {
        learner._set({
            value: value,
            proposal_num: this.highest_proposal_num
        })
    }, this)
}

Acceptor.prototype._set = function (request) {
    console.log(this.id + ' accepted ' + request.value)
    this.promised = null
    this.message = request.value
    this.highest_proposal_num = request.highest_proposal_num
}


exports.proposer = Proposer
exports.acceptor = Acceptor
