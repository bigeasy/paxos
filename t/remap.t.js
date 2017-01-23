require('proof/redux')(3, prove)

function prove (assert) {
    var Network = require('./network')
    var network = new Network
    network.addLegislators(3)
    network.legislators[0].enqueue(network.time, 1, { type: 'enqueue', value: 1 })
    network.legislators[0].enqueue(network.time, 1, { type: 'enqueue', value: 2 })
    network.addLegislators(1)
    assert(network.legislators[0].government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        immigrate: { id: '3', properties: { location: '3' }, cookie: 2 },
        constituents: [ '3' ],
        promise: '5/0'
    }, 'immigrate')
    assert(network.legislators[0].log.head.value.promise, '5/1', 'enqueued')
    assert(network.legislators[0]._findRound('5/0').value.value.map, [ { was: '4/2', is: '5/1' } ], 'remapped')
}
