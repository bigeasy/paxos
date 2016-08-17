require('proof/redux')(2, prove)

function prove (assert) {
    var Network = require('./network')
    var network = new Network
    network.addLegislators(5)
    network.timeAndTick(6)
    network.legislators[0]._whenCollapse(network.time)
    // Not enough proposals.
    assert(network.legislators[0].consensus(network.time), null, 'not enough present')
    // Run until recovered.
    network.timeAndTick(6)
    assert(network.legislators[0].government, {
        majority: [ '0', '1', '2' ],
        minority: [ '3', '4' ],
        constituents: [],
        promise: 'a/0'
    }, 'collapsed')
}
