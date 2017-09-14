require('proof')(17, prove)

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

    network.populate(1)

    network.intercept()

    network.time++

    network.intercept(1, '0', [ '1' ])

    network.time += 3

// network.intercept(1, '0', [ '1' ])

    okay(!network.denizens[0].enqueue(network.time, 1, {}).enqueued, 'post collapsed')

    network.intercept('0', [ '1' ])

    okay(network.denizens[0].government, {
        majority: [ '0', '2' ],
        minority: [ '1' ],
        constituents: [ '3' ],
        promise: '7/0',
        map: {},
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
    }, 'recover from collapse')

    network.time++

    network.intercept('0', '2', [ '1' ])

    network.time += 3

    network.intercept('0', '2', [ '1' ])

    network.time++

    network.intercept('0', '2', [ '1' ])

    network.time += 3

    network.intercept('0', '2', [ '1' ])

    okay(network.denizens[0].government, {
        majority: [ '0', '2' ],
        minority: [ '3' ],
        constituents: [],
        promise: 'a/0',
        map: {},
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '5/0': '3' },
            promise: { '0': '1/0', '2': '3/0', '3': '5/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' }
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
            promise: 'b/0',
            map: { 'a/2': 'b/1', 'a/3': 'b/2' }
        }, 'remap')
    })

    network.intercept()

    okay(network.denizens[2].log.head.body.body, 3, 'enqueued')
    okay(network.denizens[2].log.head.body.promise, 'b/2', 'remapped')

    okay(network.denizens[0].government, {
        majority: [ '0', '2' ],
        minority: [ '3' ],
        constituents: [ '4' ],
        promise: 'b/0',
        map: { 'a/2': 'b/1', 'a/3': 'b/2' },
        immigrate: { id: '4', cookie: 12, properties: { location: '4' } },
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '5/0': '3', 'b/0': '4' },
            promise: { '0': '1/0', '2': '3/0', '3': '5/0', '4': 'b/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' },
            '4': { location: '4' }
        }
    }, 'add fourth')

    network.populate(3)

    // Move our clock forward to get a differnt cookie.
    network.time++

    // This one is now unreachable because we rebooted and its history has been
    // propagated off.
    network.reboot(4)

    // This one will never join because it is already proposed and the cookie is
    // wrong.
    network.reboot(5)

    // This one will join, but with the new cookie.
    network.reboot(6)
    network.immigrate(6)

    network.intercept()

    network.time += 3

    network.intercept()

    network.time += 1

    network.intercept()

    network.time += 3

    network.intercept()

    okay(network.denizens[0].government, {
        promise: '15/0',
        majority: [ '0', '2', '3' ],
        minority: [ '6', '7' ],
        constituents: [],
        map: {},
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '5/0': '3', 'd/0': '6', 'e/0': '7' },
            promise: { '0': '1/0', '2': '3/0', '3': '5/0', '6': 'd/0', '7': 'e/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' },
            '6': { location: '6' },
            '7': { location: '7' }
        }
    }, 'reboot, exile and double immigrate')

    // Here we are going to disappear for a moment, but come back before we're
    // unreachable. For the rest of the tests 5 should be present. This covers
    // the disappearance branches, specifically already disappeared but not yet
    // unreachable.
    network.time += 1

    network.intercept('3', [ '7' ])

    network.time += 1

    network.intercept('3', [ '7' ])

    network.time += 1

    network.intercept()

    network.time += 4

    network.intercept('3', [ '2' ], [ '3' ], [ '6' ])

    network.time += 4

    network.intercept('3', [ '2' ], [ '3' ], [ '6' ])

    network.time += 4

    network.intercept('3')

    okay(network.denizens[3].government, {
        promise: '19/0',
        majority: [ '3', '0', '2' ],
        minority: [ '6', '7' ],
        constituents: [],
        map: {},
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '5/0': '3', 'd/0': '6', 'e/0': '7' },
            promise: { '0': '1/0', '2': '3/0', '3': '5/0', '6': 'd/0', '7': 'e/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' },
            '6': { location: '6' },
            '7': { location: '7' }
        }
    }, 'usurper')

    // Test that a representative chooses the least minimum entry of its
    // constituents when it calculates is minimum entry.
    network.denizens[3].enqueue(network.time, 1, 4)

    network.intercept([ '7' ])

    network.denizens[3].enqueue(network.time, 1, 5)

    network.intercept([ '7' ])

    okay(network.denizens[3]._minimums, {
        '0': { version: '19/0', propagated: '15/0', reduced: '19/1' },
        '2': { version: '19/0', propagated: '15/0', reduced: '0/0' },
        '3': { version: '19/0', propagated: '0/0', reduced: '0/0' },
    }, 'minimum unreduced')
}
