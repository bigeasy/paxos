require('proof/redux')(2, prove)

function prove (assert) {
    var Network = require('./network')
    var network = new Network
    network.addLegislators(3)
    network.legislators[0].enqueue(network.time, 1, 1)
    network.legislators[0].enqueue(network.time, 1, 2)
    network.addLegislators(1)
    assert(network.legislators[0].government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        immigrate: { id: '3', properties: { location: '3' }, cookie: 2 },
        constituents: [ '3' ],
        promise: '5/0',
        map: { '4/2': '5/1' },
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2', '5/0': '3' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0', '3': '5/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' },
            '3': { location: '3' }
        }
    }, 'immigrate')
    assert(network.legislators[0].log.head.body.body.promise, '5/1', 'enqueued')
}
