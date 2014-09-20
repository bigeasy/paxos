require('proof')(1, function (assert) {
    var paxos = require('../..')
    var proposer = new paxos.Proposer
    assert(proposer, 'ok')
})
