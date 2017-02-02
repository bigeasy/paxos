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
        promise: '6/0',
        map: {},
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2', '5/0': '3' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0', '3': '5/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' }
        }
    }, 'exile')
}
