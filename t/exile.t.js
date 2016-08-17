require('proof/redux')(1, prove)

function prove (assert) {
    var Network = require('./network')
    var network = new Network
    network.addLegislators(4)
    network.isolate(3)
    network.timeAndTick(6)
    assert(network.legislators[0].government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        exile: '3',
        constituents: [],
        promise: '6/0'
    }, 'exile')
}
