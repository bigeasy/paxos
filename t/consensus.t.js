require('proof')(16, prove)

function prove (okay) {
    var Paxos = require('..'), denizen

    var Network = require('./network')
    var network = new Network

    function dump (denizen) {
        denizen.log.each(function (entry) { console.log(entry) })
    }

    network.bootstrap()

    okay(network.denizens[0].government, {
        majority: [ '0' ],
        minority: [],
        constituents: [],
        promise: '1/0',
        immigrate: { id: '0', properties: { location: '0' }, cookie: 0 },
        map: {},
        immigrated: { id: { '1/0': '0' }, promise: { '0': '1/0' } },
        properties: { '0': { location: '0' } }
    }, 'bootstrap')

    network.push()

    okay(network.denizens[0].immigrate(network.time, 1, '1', network.denizens[1].cookie, { location: '1' }).enqueued, 'immigrate')

    network.intercept()

    okay(network.denizens[1].government, {
        majority: [ '0' ],
        minority: [],
        immigrate: { id: '1', properties: { location: '1' }, cookie: 0 },
        constituents: [ '1' ],
        promise: '2/0',
        map: {},
        immigrated: {
            id: { '1/0': '0', '2/0': '1' },
            promise: { '0': '1/0', '1': '2/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' }
        }
    }, 'leader and constituent pair')

    network.populate(1)

    network.intercept()

    okay(network.denizens[2].government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [],
        promise: '4/0',
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
    }, 'three member parliament')

    okay(!network.denizens[0].immigrate(network.time, 1, '1', network.denizens[1].cookie, { location: '1' }).enqueued, 'already immigrated')
    okay(!network.denizens[1].enqueue(network.time, 1, {}).enqueued, 'enqueue not leader')

    okay(!network.denizens[1].immigrate(network.time, 1, '4', 0, { location: '4' }).enqueued, 'immigrate not leader')

    network.time++

    network.intercept(1, '0', [ '1' ])

    network.time += 3

// network.intercept(1, '0', [ '1' ])

    okay(!network.denizens[0].enqueue(network.time, 1, {}).enqueued, 'post collapsed')

    network.intercept('0', [ '1' ])

    okay(network.denizens[0].government, {
        majority: [ '0', '2' ],
        minority: [ '1' ],
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
    }, 'recover from collapse')

    var shifter = network.denizens[0].log.shifter()

    network.denizens[0].enqueue(network.time, 1, 1)
    network.denizens[0].enqueue(network.time, 1, 2)
    network.denizens[0].enqueue(network.time, 1, 3)

    network.intercept('1')

    network.populate(1)

    shifter.join(function (envelope) {
        return envelope.method == 'government'
    }, function (error, envelope) {
        if (error) throw error
        okay({
            promise: envelope.body.promise,
            map: envelope.body.map
        }, {
            promise: '7/0',
            map: { '6/2': '7/1', '6/3': '7/2' }
        }, 'remap')
    })

    network.intercept()

    okay(network.denizens[1].log.head.body.body, 3, 'enqueued')
    okay(network.denizens[1].log.head.body.promise, '7/2', 'remapped')

    okay(network.denizens[0].government, {
        majority: [ '0', '2' ],
        minority: [ '1' ],
        constituents: [ '3' ],
        promise: '7/0',
        map: { '6/2': '7/1', '6/3': '7/2' },
        immigrate: { id: '3', cookie: 4, properties: { location: '3' } },
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2', '7/0': '3' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0', '3': '7/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' },
            '3': { location: '3' }
        }
    }, 'add fourth')

    network.populate(2)

    // Move our clock forward to get a differnt cookie.
    network.time++

    // This one will never join because it is already proposed and the cookie is
    // wrong.
    network.reboot(4)

    // This one will join, but with the new cookie.
    network.reboot(5)
    network.immigrate(5)

    network.intercept()

    network.time += 3

    network.intercept()

    network.time += 1

    network.intercept()

    network.time += 3

    network.intercept()

    okay(network.denizens[0].government, {
        promise: 'd/0',
        majority: [ '0', '2', '1' ],
        minority: [ '3', '5' ],
        constituents: [],
        map: {},
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2', '7/0': '3', 'a/0': '5' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0', '3': '7/0', '5': 'a/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' },
            '3': { location: '3' },
            '5': { location: '5' }
        }
    }, 'reboot, exile and double immigrate')

    // Here we are going to disappear for a moment, but come back before we're
    // unreachable. For the rest of the tests 5 should be present. This covers
    // the disappearance branches, specifically already disappeared but not yet
    // unreachable.
    network.time += 1

    network.intercept('1', [ '5' ])

    network.time += 1

    network.intercept('1', [ '5' ])

    network.time += 1

    network.intercept()

    network.time += 4

    network.intercept('1', [ '0' ], [ '2' ], [ '3' ])

    network.time += 4

    network.intercept('1', [ '0' ], [ '2' ], [ '3' ])

    network.time += 4

    network.intercept('1')

    okay(network.denizens[1].government, {
        promise: '11/0',
        majority: [ '1', '0', '2' ],
        minority: [ '3', '5' ],
        constituents: [],
        map: {},
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2', '7/0': '3', 'a/0': '5' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0', '3': '7/0', '5': 'a/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' },
            '3': { location: '3' },
            '5': { location: '5' }
        }
    }, 'usurper')

    // Test that a representative chooses the least minimum entry of its
    // constituents when it calculates is minimum entry.
    network.denizens[1].enqueue(network.time, 1, 4)

    network.intercept([ '5' ])

    network.denizens[1].enqueue(network.time, 1, 5)

    network.intercept([ '5' ])

    okay(network.denizens[1]._minimums, {
        '0': { version: '11/0', propagated: 'd/0', reduced: '11/1' },
        '1': { version: '11/0', propagated: 'd/0', reduced: 'd/0' },
        '2': { version: '11/0', propagated: 'd/0', reduced: 'd/0' },
    }, 'minimum unreduced')
}
