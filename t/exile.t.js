require('proof')(1, prove)

function prove (assert) {
    var Network = require('./network')
    var network = new Network
    network.addDenizens(4)
    network.isolate(3)
    network.timeAndTick(6)
    assert(network.denizens[0].government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        exile: { id: '3', promise: '5/0', properties: { location: '3' } },
        constituents: [],
        promise: '6/0',
        map: {},
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' }
        }
    }, 'exile')
}
