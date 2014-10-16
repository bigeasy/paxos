require('proof')(3, function (assert) {
    var Proposer = require('../../proposer')
    var proposer = new Proposer(1)
    proposer.reset(null, {})
    assert(proposer.startProposal('foo'), [{
        type: 'prepare',
        nodeId: 1,
        proposalId: 1
    }], 'start proposal')


    proposer._leader = true
    assert(proposer.startProposal('foo'), [{
        type: 'accept',
        proposalId: 1,
                 // ^ Why are we using the previous proposal id?
        proposal: 'foo'
    }], 'start proposal')

    assert(proposer.prepare(true, 0), [
        { eventType: 'NACK', newProposalId: 2 },
        { type: 'prepare', nodeId: 1, proposalId: 2 }
    ], 'prepare with nack')
})
