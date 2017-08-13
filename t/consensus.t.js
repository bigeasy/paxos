require('proof')(6, prove)

function prove (okay) {
    var Paxos = require('..'), denizen

    var Network = require('./network')
    var network = new Network

    network.push()

    function dump (denizen) {
        denizen.log.each(function (entry) { console.log(entry) })
    }

    var shifter = network.denizens[0].log.shifter()

    shifter.join(function (envelope) {
        return envelope.method == 'government'
    }, function (error, envelope) {
        if (error) throw error
        okay(envelope.promise, '1/0', 'government message')
        okay(network.denizens[0].government.promise, '1/0', 'government enacted')
    })

    network.denizens[0].bootstrap(network.time, { location: '0' })

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

    network.tick()

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

    network.tick()

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

    return

    assert(denizens[0].government, {
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

    assert(denizens[2].log.trailer.node.next.next.body.promise, '3/0', 'synchronized least')
    assert(denizens[2].log.head.body.body.promise, '4/0', 'synchronized')

    assert(denizens[1].enqueue(time, 1, {}).leader, '0', 'post not leader')

    denizens[0]._whenCollapse(time)
    denizens[1]._whenCollapse(time)

    assert(!denizens[0].enqueue(time, 1, {}).enqueued, 'post collapsed')

    tick()

    assert(denizens[0].government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [],
        promise: '5/0',
        map: null,
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

    denizens[0].pings[1].timeout = 1

    denizens[0]._whenKeepAlive(time)

    tick()

    assert(denizens[0].pings[1].timeout, 0, 'liveness pulse')

    denizens[1]._whenPing(time, '2')

    assert(denizens[1].pings[2].timeout, 1, 'liveness ping timeout set')

    tick()

    assert(denizens[1].pings[2].timeout, 0, 'liveness ping resolved')

    delete denizens[1].pings[2]

    denizens[1]._whenPing(time, '2')

    tick()

    assert(denizens[1].pings[2].timeout, 0, 'liveness ping materialized')

    denizens.push(denizen = createDenizen('3'))
    denizen.join(time, 1)
    denizens[0].immigrate(time, 1, '3', denizens[3].cookie, { location: '3' })
    denizens.push(denizen = createDenizen('4'))
    denizen.join(time, 1)
    denizens[0].immigrate(time, 1, '4', denizens[4].cookie, { location: '4' })
    denizens[0].enqueue(time, 1, 2)

    while (send(denizens[0]));

    assert(denizens[3].log.head.body.body.promise, '0/0', 'log before naturalization')

    tick()

    assert(denizens[3].log.trailer.node.next.next.body.promise, '6/0', 'log after naturalization')
    assert(denizens[3].log.head.body.promise, '7/1', 'log after naturalization')

    denizens[0].enqueue(time, 1, 2)
    denizens[0].enqueue(time, 1, 3)

    tick()

    // One more post to propagate the pings to the new memebers back to the
    // leader. TODO Do this by advancing clock to test pings.
    denizens[0].enqueue(time, 1, 3)

    tick()

    time++
    tick()

    time++
    tick()

    // TODO Always include exiles and naturalization empty and null by default.
    assert(denizens[0].government, {
        majority: [ '0', '1', '2' ],
        minority: [ '3', '4' ],
        constituents: [],
        promise: 'a/0',
        map: {},
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2', '6/0': '3', '7/0': '4' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0', '3': '6/0', '4': '7/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' },
            '3': { location: '3' },
            '4': { location: '4' }
        }
    }, 'five member parliament')


    denizens[0].enqueue(time, 1, 3)

    denizens[1].collapse(time)

    send(denizens[1])

    denizens[1]._nudge(time)

    tick({ 1: 'isolate' })

    time++
    tick({ 1: 'isolate' })

    assert(denizens[0].government, {
        majority: [ '0', '2', '3' ],
        minority: [ '1', '4' ],
        constituents: [],
        promise: 'b/0',
        map: null,
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2', '6/0': '3', '7/0': '4' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0', '3': '6/0', '4': '7/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' },
            '3': { location: '3' },
            '4': { location: '4' }
        }
    }, 'recover from isolation')
    return

    time++
    denizens[2].scheduler.check(time)
    tick()

    receive(denizens[1], consensus)

    // Test inability to create new government because of lack of majority.
    denizens[0].collapse(time)

    assert(denizens[0].consensus(), null, 'cannot choose leaders')

    tick()

    // Immigrate, but then restart, and assert that the restarted denizen
    // does not immigrate. (I don't see a test for success here.)
    denizens.push(denizen = createDenizen('5'))
    denizen.join(time, 1)
    denizens[0].immigrate(time, 1, '5', denizens[5].cookie, { location: '5' })

    tick({ 5: 'isolate' })

    time++

    denizens[1].scheduler.check(time)
    send(denizens[1])
    denizens[5] = createDenizen('5')
    denizens[5].join(time, 1)
    tick()

    denizens[0].collapse()
    send(denizens[0])
    send(denizens[0])
    denizens[2].collapse()
    tick({ 0: 'isolate' })
    tick()

    assert(denizens[2].republic, 1, 'island id')
}
