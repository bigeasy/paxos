require('proof/redux')(1, prove)

function prove (assert) {
    var Network = require('./network')
    var network = new Network
    network.addLegislators(5)
    network.timeAndTick(6)
    network.legislators[0].enqueue(network.time, 1, 1)
    network.legislators[0].enqueue(network.time, 1, 2)
    network.legislators[0].enqueue(network.time, 1, 3)
    network.timeAndTick(1)
    // Test that multiple messages will interleave their accepts and commits and
    // ride the same pulse.
    assert(network.legislators[0].log.head.body.body.body, 3, 'enqueued')
}
