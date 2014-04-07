function Proposer (n, id, round) {
    this.id = id
    this.round = round
    this.proposal_num = n
    this.proposal = null
    this._promised = []
    this._acceptors = []
    this.prepared = 0
    this.messages = {}
    this.proposal_queue = []
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
            sender: this.id,
            round: this.round
        })

        if (req.message === 'PROMISED') {
        // If we get a promise back, record the index so we can
        // send an 'accept' request later.
            this._promised.push(i)
        } else if (req.message === 'NOT PROMISED') {
        // Rejection - the acceptor has seen a higher proposal
        // number.
            this.proposal_num = req.highest_proposal_num + 1
        } else if (req.message === 'INVALID ROUND') {
        // Round already finished, somehow we are behind.
            this.round = req.round
            this.highest_proposal_num = req.highest_proposal_num
        } else {
        // Uh oh. Why are we here?
            throw new Error
        }
    }
    if (this._promised.length > (this._acceptors.length / 2)) {
        // If we have promises from the majority of acceptors,
        // finish the proposal.
        this.propose()
    }
}

Proposer.prototype.propose = function () {
    // Send an 'accept' request to each promised acceptor
    this._promised.forEach(function (i) {
        this.value = this._acceptors[i].accept( { value: this.proposal, sender: this.id } )
    }, this)
    this._promised = []
    this.proposal_num = 0
    this.round += 1
}

function Acceptor (n, id, round) {
    this.id = id
    this.highest_proposal_num = n
    this.messages = {}
    this.learners = []
    this.promised = null
    this.locked = false
    this.round = round
}

Acceptor.prototype.prep = function (request) {
    if (request.proposal_num > this.highest_proposal_num &&
        this.round === request.round) {
        // This is the highest we've seen. Promise it.
        this.highest_proposal_num = request.proposal_num
        this.promised = request.sender
        console.log(this.id + ' promised ' + request.sender)

        return {
            message: 'PROMISED'
        }

    } else if (request.proposal_num > this.highest_proposal_num) {
        // send a not-so-success-y response
        // that includes this.highest_proposal
        return {
            message: 'NOT PROMISED',
            highest_proposal_num: this.highest_proposal_num
        }
    } else {
        // round numbers don't match - this acceptor has
        // already accepted a value and sent to learner
        return  {
            message: 'INVALID ROUND',
            round: this.round,
            highest_proposal_num: this.highest_proposal_num
        }
    }
}

Acceptor.prototype.accept = function (request) {
    //  ensure this is the sender we promised to wait for.
    //  Possible that another proposer could hijack our
    //  proposal number somehow
    if (this.promised === request.sender) {
        console.log(this.id + ' accepted ' + request.value)
        this.messages['' + this.round] = request.value
        this._send( { round: this.round, value: request.value } )
        return request.value
    }

    return false
}


Acceptor.prototype.addLearners = function (learners) {
    learners.forEach(function (learner) {
        this.learners.push(learner)
    }, this)
}

Acceptor.prototype._send = function (value) {
    this.learners.forEach(function (learner) {
        learner.add({
            value: value,
            round: this.round
        })
    }, this)
    this.round += 1
}

function Learner (round, acceptors) {
    this.acceptors = acceptors
    this.round = round
    this.accepted = {}
    this.messages = {}
}

Learner.prototype.add = function (req) {
    if (req.round === this.round) {
        this.accepted['' + req.value] = this.accepted['' + req.value] + 1 || 1
    } else {
        console.log('An acceptor is out of sync.')
        throw new Error //this shouldn't happen, ever.
    }

    if (this.acccepted['' + req.value] > (this.acceptors.length / 2)) {
        this.messages['' + this.round] = req.value
        this.round += 1
    }
}

Learner.prototype.get = function (round) {
    return this.messages['' + round]
}

exports.proposer = Proposer
exports.acceptor = Acceptor
exports.learner = Learner
