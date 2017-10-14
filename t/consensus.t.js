require('proof')(25, prove)

function prove (okay) {
    var Paxos = require('..'), denizen

    var Network = require('./network')
    var network = new Network

    function dump (value) {
        console.log(require('util').inspect(value, { depth: null }))
    }

    network.bootstrap()

    okay(network.denizens[0].government, {
        majority: [ '0' ],
        minority: [],
        naturalized: [ '0' ],
        constituents: [],
        promise: '1/0',
        immigrated: { id: { '1/0': '0' }, promise: { '0': '1/0' } },
        properties: { '0': { location: '0' } }
    }, 'bootstrap')

    network.push()
    okay(network.denizens[0].immigrate(network.time, 1, '1', network.denizens[1].cookie, { location: '1' }, true).enqueued, 'immigrate')

    network.send()

    okay(network.denizens[1].government, {
        majority: [ '0' ],
        minority: [],
        naturalized: [ '0', '1' ],
        constituents: [ '1' ],
        promise: '2/0',
        immigrated: {
            id: { '1/0': '0', '2/0': '1' },
            promise: { '0': '1/0', '1': '2/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' }
        }
    }, 'leader and constituent pair')

    network.push()
    // TODO Turn off immigration and ensure that it is not able to join the
    // government.
    network.denizens[0].immigrate(network.time, 1, '2', network.denizens[2].cookie, { location: '2' }, false)

    network.send()

    okay(network.denizens[2].government, {
        majority: [ '0' ],
        minority: [],
        naturalized: [ '0', '1' ],
        constituents: [ '1', '2' ],
        promise: '3/0',
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' }
        }
    }, 'immigrate without naturalization')

    network.denizens[2].naturalize()
    network.time += 1
    network.send()

    okay(network.denizens[2].government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        naturalized: [ '0', '1', '2' ],
        constituents: [],
        promise: '5/0',
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

    network.send()

    network.time++

    // Grab a ping and hold onto to it for a while. We're going to return it to
    // the sender failed after the government changes to test that it rejects
    // the delayed message.
    var ping = network.send('2', { ping: [ '3' ] })

    network.send(1, '0', [ '1' ])

    network.time += 3

// network.send(1, '0', [ '1' ])

    okay(!network.denizens[0].enqueue(network.time, 1, {}).enqueued, 'post collapsed')

    network.send('0', [ '1' ])

    okay(network.denizens[0].government, {
        majority: [ '0', '2' ],
        minority: [ '1' ],
        naturalized: [ '0', '1', '2', '3' ],
        constituents: [ '3' ],
        promise: '8/0',
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2', '6/0': '3' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0', '3': '6/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' },
            '3': { location: '3' }
        }
    }, 'recover from collapse')

    ping.ping[0].responses[3] = null
    network.response(ping.ping[0])

    network.time++

    network.send('0', '2', [ '1' ])

    network.time += 3

    network.send('0', '2', [ '1' ])

    network.time++

    network.send('0', '2', [ '1' ])

    network.time += 3

    network.send('0', '2', [ '1' ])

    okay(network.denizens[0].government, {
        promise: 'b/0',
        majority: [ '0', '2' ],
        minority: [ '3' ],
        naturalized: [ '0', '2', '3' ],
        constituents: [],
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' }
        }
    }, 'exile')

    var shifter = network.denizens[0].log.shifter()

    network.denizens[0].enqueue(network.time, 1, 1)
    network.denizens[0].enqueue(network.time, 1, 2)
    network.denizens[0].enqueue(network.time, 1, 3)

    network.send('1')

    network.populate(1)

    shifter.join(function (envelope) {
        return envelope.government != null
    }, function (error, envelope) {
        if (error) throw error
        okay({
            promise: envelope.body.promise,
            map: envelope.body.map
        }, {
            promise: 'c/0',
            map: { 'b/2': 'c/1', 'b/3': 'c/2' }
        }, 'remap')
    })

    network.send()

    okay(network.denizens[2].log.head.body.body, 3, 'enqueued')
    okay(network.denizens[2].log.head.body.promise, 'c/2', 'remapped')

    okay(network.denizens[0].government, {
        promise: 'c/0',
        majority: [ '0', '2' ],
        minority: [ '3' ],
        naturalized: [ '0', '2', '3', '4' ],
        constituents: [ '4' ],
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', 'c/0': '4' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '4': 'c/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' },
            '4': { location: '4' }
        }
    }, 'add fourth')

    // Propagate minimums to clear out the immigration entry for 4.
    network.tick(2)

    // Add some new citizens.
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

    network.send()

    network.time += 3

    network.send()

    network.time += 1

    network.send()

    network.time += 3

    network.send()

    okay(network.denizens[0].government, {
        promise: '14/0',
        majority: [ '0', '2', '3' ],
        minority: [ '6', '7' ],
        naturalized: [ '0', '2', '3', '6', '7' ],
        constituents: [],
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', 'e/0': '6', 'f/0': '7' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': 'e/0', '7': 'f/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' },
            '6': { location: '6' },
            '7': { location: '7' }
        }
    }, 'reboot, exile and double immigrate')

    // Reject messages from a different republic.
    network.populate(1)

    network.send()

    network.reboot(8, 2)
    network.denizens[8].bootstrap(network.time, { location: '8' })

    network.send()

    network.time += 1

    network.send()

    network.time += 4

    network.send()

    // Here we are going to disappear for a moment, but come back before we're
    // unreachable. For the rest of the tests 5 should be present. This covers
    // the disappearance branches, specifically already disappeared but not yet
    // unreachable.
    network.time += 1

    network.send('3', [ '7' ])

    network.time += 1

    network.send('3', [ '7' ])

    network.time += 1

    network.send()

    network.time += 4

    network.send('3', [ '2' ], [ '3' ], [ '6' ])

    network.time += 4

    network.send('3', [ '2' ], [ '3' ], [ '6' ])

    network.time += 4

    network.send('3')

    okay(network.denizens[3].government, {
        promise: '1a/0',
        majority: [ '3', '0', '2' ],
        minority: [ '6', '7' ],
        naturalized: [ '0', '2', '3', '6', '7' ],
        constituents: [],
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', 'e/0': '6', 'f/0': '7' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': 'e/0', '7': 'f/0' }
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

    network.send([ '7' ])

    network.denizens[3].enqueue(network.time, 1, 5)

    network.send([ '7' ])

    okay(network.denizens[3]._minimums, {
        '0': { version: '1a/0', propagated: '15/0', reduced: '1a/1' },
        '2': { version: '1a/0', propagated: '15/0', reduced: '0/0' },
        '3': { version: '1a/0', propagated: '0/0', reduced: '0/0' },
    }, 'minimum unreduced')

    network.send()

    network.denizens[7].inspect()

    network.push()
    network.denizens[3].immigrate(network.time, 1, '9', network.denizens[9].cookie, { location: '9' })
    network.push()
    network.denizens[3].immigrate(network.time, 1, '10', network.denizens[10].cookie, { location: '10' })

    network.send()

    okay(network.denizens[3].government, {
        promise: '1c/0',
        majority: [ '3', '0', '2' ],
        minority: [ '6', '7' ],
        naturalized: [ '0', '2', '3', '6', '7' ],
        constituents: [ '9', '10' ],
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', 'e/0': '6', 'f/0': '7', '1b/0': '9', '1c/0': '10' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': 'e/0', '7': 'f/0', '9': '1b/0', '10': '1c/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' },
            '6': { location: '6' },
            '7': { location: '7' },
            '9': { location: '9' },
            '10': { location: '10' }
        }
    }, 'immigrate without naturalization')

    // This exercises the already naturalized branch of `Paxos.naturalize`.
    network.denizens[3].naturalize()

    network.denizens[9].naturalize()
    network.denizens[10].naturalize()

    network.time += 1

    network.send()

    network.time += 1

    network.send()

    okay(network.denizens[3].government, {
        promise: '1e/0',
        majority: [ '3', '0', '2' ],
        minority: [ '6', '7' ],
        naturalized: [ '0', '2', '3', '6', '7', '9', '10' ],
        constituents: [ '9', '10' ],
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', 'e/0': '6', 'f/0': '7', '1b/0': '9', '1c/0': '10' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': 'e/0', '7': 'f/0', '9': '1b/0', '10': '1c/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' },
            '6': { location: '6' },
            '7': { location: '7' },
            '9': { location: '9' },
            '10': { location: '10' }
        }
    }, 'naturalized')

    network.push()
    network.denizens[3].immigrate(network.time, 1, '11', network.denizens[11].cookie, { location: '11' })

    network.send()

    okay(network.denizens[3].government, {
        promise: '1f/0',
        majority: [ '3', '0', '2' ],
        minority: [ '6', '7' ],
        naturalized: [ '0', '2', '3', '6', '7', '9', '10' ],
        constituents: [ '9', '10', '11' ],
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', 'e/0': '6', 'f/0': '7', '1b/0': '9', '1c/0': '10', '1f/0': '11' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': 'e/0', '7': 'f/0', '9': '1b/0', '10': '1c/0', '11': '1f/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' },
            '6': { location: '6' },
            '7': { location: '7' },
            '9': { location: '9' },
            '10': { location: '10' },
            '11': { location: '11' }
        }
    }, 'not yet naturalized')

    network.time += 1

    network.send([ '11' ])

    network.time += 1

    network.send([ '11' ])

    network.time += 2

    network.send([ '11' ])

    network.time += 1

    network.send()

    okay(network.denizens[3].government, {
        promise: '20/0',
        majority: [ '3', '0', '2' ],
        minority: [ '6', '7' ],
        naturalized: [ '0', '2', '3', '6', '7', '9', '10' ],
        constituents: [ '9', '10' ],
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', 'e/0': '6', 'f/0': '7', '1b/0': '9', '1c/0': '10' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': 'e/0', '7': 'f/0', '9': '1b/0', '10': '1c/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' },
            '6': { location: '6' },
            '7': { location: '7' },
            '9': { location: '9' },
            '10': { location: '10' }
        }
    }, 'exiled before naturalized')

    network.populate(1)
    var intercept = network.send('0', '2', '3',  '6', '7', { sync: [{ to: '9' }] })
    network.time += 1
    network.send([ '12' ])
    network.time += 2
    network.send([ '12' ])
    network.time += 2
    network.send([ '12' ])
    network.time += 1
    network.send([ '12' ])
    network.time += 1
    network.send([ '12' ])

    network.reboot(12)
    network.immigrate(12)

    network.send()

    // Note that with this I discovered that delayed network messages can of
    // course be below the minimum so the receipient cannot return sync.
    intercept.sync.forEach(receive)

    okay(network.denizens[6]._disappeared, {}, 'disappeared cleared')

    okay(network.denizens[12].government, {
        promise: '23/0',
        majority: [ '3', '0', '2' ],
        minority: [ '6', '7' ],
        naturalized: [ '0', '2', '3', '6', '7', '9', '10', '12' ],
        constituents: [ '9', '10', '12' ],
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', 'e/0': '6', 'f/0': '7', '1b/0': '9', '1c/0': '10', '23/0': '12' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': 'e/0', '7': 'f/0', '9': '1b/0', '10': '1c/0', '12': '23/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' },
            '6': { location: '6' },
            '7': { location: '7' },
            '9': { location: '9' },
            '10': { location: '10' },
            '12': { location: '12' }
        }
    }, 'use latest immigration to onboard')

    // Set it up so that the proposers do not make proposals to one another
    // since that's how I've always sketched it out on paper.
    network.time += 4

    network.send('0', [ '2' ], [ '3' ])
    network.send('2', [ '0' ], [ '3' ])
    network.send(1, '3', [ '0' ], [ '2' ])

    network.time += 4

    // Test rejecting a prepare message with a prepare race.
    var intercept = network.send('0', '2', {
        prepare: {
            request: { message: { method: 'prepare' }, synchronize: false }
        }
    })

    network.pluck(intercept.prepare, { from: '0' }).forEach(receive)
    network.pluck(intercept.prepare, { from: '2' }).forEach(receive)

    network.time += 4

    function receive (envelope) {
        network.request(envelope)
        network.response(envelope)
    }

    // Test rejecting an accept because a subsequent promise has been made.
    var intercept = network.send('0', '2', { six: [{ to: '6' }], seven: [{ to: '7' }] })

    network.pluck(intercept.six, { from: '0' }).forEach(receive)
    network.pluck(intercept.seven, { from: '2' }).forEach(receive)
    intercept.seven.forEach(receive)
    intercept.six.forEach(receive)

    network.send('3', {
        prepare: {
            request: { message: { method: 'prepare' }, synchronize: false }
        }
    }).prepare.forEach(receive)

    network.time += 4

    // Get a round of Paxos poised to accept.
    var accept = network.send('3', {
        accept: {
            request: { message: { method: 'accept' }, synchronize: false }
        }
    })

    network.pluck(accept.accept, { to: '7' }).forEach(receive)
    network.pluck(accept.accept, { to: '6' }).forEach(receive)

    network.send('2')

    network.time += 4

    network.send('2', {
        accept: {
            request: { message: { method: 'accept' }, synchronize: false }
        }
    }).accept.forEach(receive)

    accept.accept.forEach(receive)

    network.send('3', {
        sync: {
            request: { message: { method: 'register' }, synchronize: false }
        }
    }).sync.forEach(receive)

    network.send()

    okay(network.denizens[2].government, {
        promise: '29/0',
        majority: [ '2', '6', '7' ],
        minority: [ '3', '0' ],
        naturalized: [ '0', '2', '3', '6', '7', '9', '10', '12' ],
        constituents: [ '9', '10', '12' ],
        immigrated: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', 'e/0': '6', 'f/0': '7', '1b/0': '9', '1c/0': '10', '23/0': '12' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': 'e/0', '7': 'f/0', '9': '1b/0', '10': '1c/0', '12': '23/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' },
            '6': { location: '6' },
            '7': { location: '7' },
            '9': { location: '9' },
            '10': { location: '10' },
            '12': { location: '12' }
        }
    }, 'a lot of paxos')
}
