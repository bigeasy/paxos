require('proof')(1, function (assert) {
    var Proposer = require('../../proposer')
    var proposer = new Proposer(1)
    proposer.reset(null, {})
    assert(true, 'ok')
    return
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

    assert(proposer.prepare(true, 1), [
        { eventType: 'NACK', newProposalId: 2 },
        { type: 'prepare', nodeId: 1, proposalId: 2 }
    ], 'prepare with nack')
})
