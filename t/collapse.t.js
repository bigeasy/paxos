require('proof')(1, prove)

function prove (assert) {
    var Network = require('./network')
    var network = new Network
    network.addLegislators(5)
    network.timeAndTick(6)
    network.legislators[0]._whenCollapse(network.time)
    network.timeAndTick(6)
    assert(network.legislators[0].government, {
        majority: [ '0', '1', '2' ],
        minority: [ '3', '4' ],
        constituents: [],
        promise: '8/0'
    }, 'collapsed')
}
