require('proof')(1, function (assert) {
    var paxos = require('../../paxos')
    var proposer = new paxos.Proposer
    assert(proposer, 'ok')
})
