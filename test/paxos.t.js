require('proof')(27, (okay) => {
    var Paxos = require('..'), denizen

    var Network = require('./network')
    var network = new Network

    function dump (value) {
        console.log(require('util').inspect(value, { depth: null }))
    }

    network.bootstrap()

    okay(network.denizens[0].government, {
        republic: 1,
        majority: [ '0' ],
        minority: [],
        acclimated: [ '0' ],
        constituents: [],
        promise: '1/0',
        arrived: { id: { '1/0': '0' }, promise: { '0': '1/0' } },
        properties: { '0': { location: '0' } }
    }, 'bootstrap')

    network.push()
    network.denizens[1].join(1, network.time)
    okay(network.denizens[0].embark(network.time, 1, '1', network.denizens[1].cookie, { location: '1' }, true).enqueued, 'arrive')

    network.send()

    okay(network.denizens[1].government, {
        republic: 1,
        majority: [ '0' ],
        minority: [],
        acclimated: [ '0', '1' ],
        constituents: [ '1' ],
        promise: '2/0',
        arrived: {
            id: { '1/0': '0', '2/0': '1' },
            promise: { '0': '1/0', '1': '2/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' }
        }
    }, 'leader and constituent pair')

    // Fix a bug from the days when the leader would not update it's
    // `_committed` table entry for itself immediately after and an entry to the
    // log. Race condition where if we're lucky, the leader will update itself
    // with a keep-alive synchronization before it updates it's consistent. If
    // the constituent goes first, the minimum propagated promise would be
    // calculated using the results of pinging the single member synod's one
    // constituent. Then when the leader pings itself, it's entry in the
    // `_committed` table will precede the minimum propagated resulting in an
    // error.
    network.denizens[0].intercept = [ '0' ]
    network.denizens[0].enqueue(network.time, 1, 5)
    network.send()
    network.denizens[0].intercept.length = 0
    network.denizens[0].events.splice(0, network.denizens[0].events.length).forEach(function (event) {
        network.denizens[0].event(event)
    })
    network.send()

    network.push()
    network.denizens[2].join(1, network.time)
    // TODO Turn off arrival and ensure that it is not able to join the
    // government.
    network.denizens[0].embark(network.time, 1, '2', network.denizens[2].cookie, { location: '2' }, false)

    network.send()

    okay(network.denizens[2].government, {
        republic: 1,
        majority: [ '0' ],
        minority: [],
        acclimated: [ '0', '1' ],
        constituents: [ '1', '2' ],
        promise: '3/0',
        arrived: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' }
        }
    }, 'arrive without acclimation')

    network.denizens[2].acclimate()
    network.time += 1
    network.send()

    okay(network.denizens[2].government, {
        republic: 1,
        majority: [ '0', '1' ],
        minority: [ '2' ],
        acclimated: [ '0', '1', '2' ],
        constituents: [],
        promise: '5/0',
        arrived: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' }
        }
    }, 'three member parliament')

    okay(!network.denizens[0].embark(network.time, 1, '1', network.denizens[1].cookie, { location: '1' }).enqueued, 'already arrived')
    okay(!network.denizens[1].enqueue(network.time, 1, {}).enqueued, 'enqueue not leader')

    okay(!network.denizens[1].embark(network.time, 1, '4', 0, { location: '4' }).enqueued, 'arrive not leader')

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
        republic: 1,
        majority: [ '0', '2' ],
        minority: [ '1' ],
        acclimated: [ '0', '1', '2', '3' ],
        constituents: [ '3' ],
        promise: '8/0',
        arrived: {
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
        republic: 1,
        promise: '11/0',
        majority: [ '0', '2' ],
        minority: [ '3' ],
        acclimated: [ '0', '2', '3' ],
        constituents: [],
        arrived: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' }
        }
    }, 'depart')

    var shifter = network.denizens[0].log.shifter().sync

    network.denizens[0].enqueue(network.time, 1, 1)
    network.denizens[0].enqueue(network.time, 1, 2)
    network.denizens[0].enqueue(network.time, 1, 3)

    network.send('1')

    network.populate(1)

    network.send()

    okay(network.denizens[2].top.body, 3, 'enqueued')
    okay(network.denizens[2].top.promise, '12/2', 'remapped')

    for (const entry of shifter.iterator()) {
        if (entry.promise == '12/0') {
            okay({
                promise: entry.promise,
                map: entry.body.map
            }, {
                promise: '12/0',
                map: { '11/2': '12/1', '11/3': '12/2' }
            }, 'remap')
        }
    }

    okay(network.denizens[0].government, {
        republic: 1,
        promise: '12/0',
        majority: [ '0', '2' ],
        minority: [ '3' ],
        acclimated: [ '0', '2', '3', '4' ],
        constituents: [ '4' ],
        arrived: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', '12/0': '4' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '4': '12/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' },
            '4': { location: '4' }
        }
    }, 'add fourth')

    // Propagate minimums to clear out the arrival entry for 4.
    network.tick(2)

    // Add some new islanders.
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
    network.embark(6)

    network.send()

    network.time += 3

    network.send()

    network.time += 1

    network.send()

    network.time += 3

    network.send()

    okay(network.denizens[0].government, {
        republic: 1,
        promise: '20/0',
        majority: [ '0', '2', '3' ],
        minority: [ '6', '7' ],
        acclimated: [ '0', '2', '3', '6', '7' ],
        constituents: [],
        arrived: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', '14/0': '6', '15/0': '7' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': '14/0', '7': '15/0' }
        },
        properties: {
            '0': { location: '0' },
            '2': { location: '2' },
            '3': { location: '3' },
            '6': { location: '6' },
            '7': { location: '7' }
        }
    }, 'reboot, depart and double arrive')

    // Reject messages from a different republic.
    network.populate(1)

    network.send()

    network.reboot(8)
    network.denizens[8].bootstrap(2, network.time, { location: '8' })

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
        republic: 1,
        promise: '26/0',
        majority: [ '3', '0', '2' ],
        minority: [ '6', '7' ],
        acclimated: [ '0', '2', '3', '6', '7' ],
        constituents: [],
        arrived: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', '14/0': '6', '15/0': '7' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': '14/0', '7': '15/0' }
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
        '0': { version: '26/0', propagated: '21/0', reduced: '26/1' },
        '2': { version: '26/0', propagated: '21/0', reduced: '0/0' },
        '3': { version: '26/0', propagated: '0/0', reduced: '0/0' },
    }, 'minimum unreduced')

    network.send()

    network.denizens[7].inspect()

    network.push()
    network.denizens[9].join(1, network.time)
    network.denizens[3].embark(network.time, 1, '9', network.denizens[9].cookie, { location: '9' })
    network.push()
    network.denizens[10].join(1, network.time)
    network.denizens[3].embark(network.time, 1, '10', network.denizens[10].cookie, { location: '10' })

    network.send()

    okay(network.denizens[3].government, {
        republic: 1,
        promise: '28/0',
        majority: [ '3', '0', '2' ],
        minority: [ '6', '7' ],
        acclimated: [ '0', '2', '3', '6', '7' ],
        constituents: [ '9', '10' ],
        arrived: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', '14/0': '6', '15/0': '7', '27/0': '9', '28/0': '10' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': '14/0', '7': '15/0', '9': '27/0', '10': '28/0' }
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
    }, 'arrive without acclimation')

    // This exercises the already acclimated branch of `Paxos.acclimate`.
    network.denizens[3].acclimate()

    network.denizens[9].acclimate()
    network.denizens[10].acclimate()

    network.time += 1

    network.send()

    network.time += 1

    network.send()

    okay(network.denizens[3].government, {
        republic: 1,
        promise: '30/0',
        majority: [ '3', '0', '2' ],
        minority: [ '6', '7' ],
        acclimated: [ '0', '2', '3', '6', '7', '9', '10' ],
        constituents: [ '9', '10' ],
        arrived: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', '14/0': '6', '15/0': '7', '27/0': '9', '28/0': '10' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': '14/0', '7': '15/0', '9': '27/0', '10': '28/0' }
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
    }, 'acclimated')

    network.push()
    network.denizens[11].join(1, network.time)
    network.denizens[3].embark(network.time, 1, '11', network.denizens[11].cookie, { location: '11' })

    network.send()

    okay(network.denizens[3].government, {
        republic: 1,
        promise: '31/0',
        majority: [ '3', '0', '2' ],
        minority: [ '6', '7' ],
        acclimated: [ '0', '2', '3', '6', '7', '9', '10' ],
        constituents: [ '9', '10', '11' ],
        arrived: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', '14/0': '6', '15/0': '7', '27/0': '9', '28/0': '10', '31/0': '11' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': '14/0', '7': '15/0', '9': '27/0', '10': '28/0', '11': '31/0' }
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
    }, 'not yet acclimated')

    network.time += 1

    network.send([ '11' ])

    network.time += 1

    network.send([ '11' ])

    network.time += 2

    network.send([ '11' ])

    network.time += 1

    network.send()

    okay(network.denizens[3].government, {
        republic: 1,
        promise: '32/0',
        majority: [ '3', '0', '2' ],
        minority: [ '6', '7' ],
        acclimated: [ '0', '2', '3', '6', '7', '9', '10' ],
        constituents: [ '9', '10' ],
        arrived: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', '14/0': '6', '15/0': '7', '27/0': '9', '28/0': '10' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': '14/0', '7': '15/0', '9': '27/0', '10': '28/0' }
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
    }, 'departed before acclimated')

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
    network.embark(12)

    network.send()

    // Note that with this I discovered that delayed network messages can of
    // course be below the minimum so the receipient cannot return sync.
    intercept.sync.forEach(receive)

    okay(network.denizens[6]._disappeared, {}, 'disappeared cleared')

    okay(network.denizens[12].government, {
        republic: 1,
        promise: '35/0',
        majority: [ '3', '0', '2' ],
        minority: [ '6', '7' ],
        acclimated: [ '0', '2', '3', '6', '7', '9', '10', '12' ],
        constituents: [ '9', '10', '12' ],
        arrived: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', '14/0': '6', '15/0': '7', '27/0': '9', '28/0': '10', '35/0': '12' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': '14/0', '7': '15/0', '9': '27/0', '10': '28/0', '12': '35/0' }
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
    }, 'use latest arrival to onboard')

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

    network.denizens[0].inspect()

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
        republic: 1,
        promise: '41/0',
        majority: [ '2', '6', '7' ],
        minority: [ '3', '0' ],
        acclimated: [ '0', '2', '3', '6', '7', '9', '10', '12' ],
        constituents: [ '9', '10', '12' ],
        arrived: {
            id: { '1/0': '0', '3/0': '2', '6/0': '3', '14/0': '6', '15/0': '7', '27/0': '9', '28/0': '10', '35/0': '12' },
            promise: { '0': '1/0', '2': '3/0', '3': '6/0', '6': '14/0', '7': '15/0', '9': '27/0', '10': '28/0', '12': '35/0' }
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

    network.denizens[2].inspect()

    network.reboot(13)
    network.denizens[13].join(1, 0)
    network.denizens[2].embark(network.time, 1, '13', 1, { location: '13' }, true)

    network.send()

    okay(network.denizens[2].government.arrived.promise['13'], '42/0', 'arrived')

    network.time++
    network.send()
    network.time++
    network.send()
    network.time++
    network.send()
    network.time++
    network.send()

    okay(!network.denizens[2].government.arrived.promise['13'], 'bad embark cookie')
})
