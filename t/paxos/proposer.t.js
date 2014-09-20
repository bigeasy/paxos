require('proof')(4, function (assert) {
    var paxos = require('../../paxos')
    var proposer = new paxos.Proposer(1, function () { return 'bar' })
    assert(proposer.startProposal('foo'), [{
        type: 'prepare',
        nodeId: 1,
        proposalId: 'bar'
    }], 'specify proposal id creator')

    var proposer = new paxos.Proposer(1)
    assert(proposer.startProposal('foo'), [{
        type: 'prepare',
        nodeId: 1,
        proposalId: 0
    }], 'start proposal')


    proposer._leader = true
    assert(proposer.startProposal('foo'), [{
        type: 'accept',
        proposalId: 0,
                 // ^ Why are we using the previous proposal id?
        proposal: 'foo'
    }], 'start proposal')

    assert(proposer.prepare(true, 0), [
        { eventType: 'NACK', newProposalId: 1 },
        { type: 'prepare', nodeId: 1, proposalId: 1 }
    ], 'prepare with nack')
})
