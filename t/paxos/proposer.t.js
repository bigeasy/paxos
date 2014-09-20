require('proof')(1, function (assert) {
    var paxos = require('../../redux')
    var proposer = new paxos.Proposer
    assert(proposer, 'ok')
})
