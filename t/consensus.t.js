require('proof/redux')(21, prove)

function prove (assert) {
    var Paxos = require('..'), denizen

    function dump (denizen) {
        denizen.log.each(function (entry) { console.log(entry) })
    }

    var time = 0

    var options = {
        parliamentSize: 5,
        ping: 1,
        timeout: 3,
        naturalized: true,
        shifter: true
    }

    function createDenizen (id) {
        var paxos = new Paxos(id, options)
        paxos.scheduler.events.shifter().pump(paxos.event.bind(paxos))
        paxos.shifter = paxos.outbox.shifter()
        return paxos
    }

    var denizens = [ createDenizen('0') ]
    denizens[0].bootstrap(time, 1, { location: '0' })

    function receive (denizen, send, failures) {
        failures || (failures = {})
        var responses = {}
        send.route.forEach(function (id) {
            var denizen = denizens[id]
            if (failures[id] != 'request' && failures[id] != 'isolate') {
                responses[id] = denizen.receive(time, send, send.messages)
            }
            if (failures[id] == 'response') {
                delete responses[id]
            }
        })
        denizen.sent(time, send, responses)
    }

    function send (denizen, failures) {
        failures || (failures = {})
        var sent = false, message
        while (denizen.shifter.peek()) {
            message = denizen.shifter.shift()
            receive(denizen, message, failures)
            sent = true
        }
        return sent
    }

    function tick (failures) {
        failures || (failures = {})
        var ticked = true
        while (ticked) {
            ticked = false
            denizens.forEach(function (denizen) {
                if (failures[denizen.id] != 'isolate') {
                    denizen.scheduler.check(time)
                    while (send(denizen, failures)) {
                        ticked = true
                    }
                }
            })
        }
    }

    tick()

    assert(denizens[0].government, {
        majority: [ '0' ],
        minority: [],
        constituents: [],
        promise: '1/0',
        map: {},
        immigrated: { id: { '1/0': '0' }, promise: { '0': '1/0' } },
        properties: { '0': { location: '0' } }
    }, 'bootstrap')

    denizens.push(denizen = createDenizen('1'))
    denizen.join(time, 1)

    assert(denizens[0].immigrate(time, 1, '1', denizens[1].cookie, { location: '1' }).enqueued, 'immigrate')

    tick({ 1: 'request' })

    time++

    assert(denizens[0].scheduler.check(time), 'ping missed')

    tick({ 1: 'request' })

    time++

    denizens[0].scheduler.check(time)

    tick()

    assert(denizens[0].government, {
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

    assert(denizens[1].least.node.next.peek().promise, '2/0', 'synchronized')
    assert(denizens[1].log.head.body.body.promise, '2/0', 'synchronized')

    denizens.push(denizen = createDenizen('2'))
    denizen.join(time, 1)
    denizens[0].enqueue(time, 1, 1)
    denizens[0].immigrate(time, 1, '2', denizens[2].cookie, { location: '2' })

    tick()

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

    assert(denizens[2].least.node.next.peek().promise, '3/0', 'synchronized least')
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

    assert(denizens[3].least.node.next.peek().promise, '6/0', 'log after naturalization')
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
