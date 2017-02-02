require('proof/redux')(22, prove)

function prove (assert) {
    var Legislator = require('../legislator'), legislator

    function dump (legislator) {
        legislator.log.each(function (entry) { console.log(entry) })
    }

    var time = 0

    var options = {
        parliamentSize: 5,
        ping: 1,
        timeout: 3,
        naturalized: true,
        scheduler: { timerless: true },
        shifter: true
    }

    var legislators = [ new Legislator('0', options) ]
    legislators[0].bootstrap(time, 1, { location: '0' })

    function receive (legislator, send, failures) {
        failures || (failures = {})
        var responses = {}
        send.route.forEach(function (id) {
            var legislator = legislators[id]
            if (failures[id] != 'request' && failures[id] != 'isolate') {
                responses[id] = legislator.receive(time, send, send.messages)
            }
            if (failures[id] == 'response') {
                delete responses[id]
            }
        })
        legislator.sent(time, send, responses)
    }

    function send (legislator, failures) {
        failures || (failures = {})
        var sent = false, message
        while (legislator.shifter.peek()) {
            message = legislator.shifter.shift()
            receive(legislator, message.body, failures)
            sent = true
        }
        return sent
    }

    function tick (failures) {
        failures || (failures = {})
        var ticked = true
        while (ticked) {
            ticked = false
            legislators.forEach(function (legislator) {
                if (failures[legislator.id] != 'isolate') {
                    legislator.scheduler.check(time)
                    while (send(legislator, failures)) {
                        ticked = true
                    }
                }
            })
        }
    }

    tick()

    assert(legislators[0].government, {
        majority: [ '0' ],
        minority: [],
        constituents: [],
        promise: '1/0',
        map: {},
        immigrated: { id: { '1/0': '0' }, promise: { '0': '1/0' } }
    }, 'bootstrap')

    legislators.push(legislator = new Legislator('1', options))
    legislator.join(time, 1)

    assert(legislators[0].immigrate(time, 1, '1', legislators[1].cookie, { location: '1' }).enqueued, 'immigrate')

    tick({ 1: 'request' })

    time++

    assert(legislators[0].scheduler.check(time), 'ping missed')

    tick({ 1: 'request' })

    time++

    legislators[0].scheduler.check(time)

    tick()

    assert(legislators[0].government, {
        majority: [ '0' ],
        minority: [],
        immigrate: { id: '1', properties: { location: '1' }, cookie: 0 },
        constituents: [ '1' ],
        promise: '2/0',
        map: {},
        immigrated: {
            id: { '1/0': '0', '2/0': '1' },
            promise: { '0': '1/0', '1': '2/0' }
        }
    }, 'leader and constituent pair')

    assert(legislators[1].least.node.next.peek().promise, '2/0', 'synchronized')
    assert(legislators[1].log.head.body.body.promise, '2/0', 'synchronized')
    assert(legislators[1].properties, {
        '0': { location: '0', immigrated: '1/0' },
        '1': { location: '1', immigrated: '2/0' }
    }, 'citizens')

    legislators.push(legislator = new Legislator('2', options))
    legislator.join(time, 1)
    legislators[0].enqueue(time, 1, { type: 'enqueue', value: 1 })
    legislators[0].immigrate(time, 1, '2', legislators[2].cookie, { location: '2' })

    tick()

    assert(legislators[0].government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [],
        promise: '4/0',
        map: {},
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0' }
        }
    }, 'three member parliament')

    assert(legislators[2].least.node.next.peek().promise, '3/0', 'synchronized least')
    assert(legislators[2].log.head.body.body.promise, '4/0', 'synchronized')

    assert(legislators[1].enqueue(time, 1, {}).leader, '0', 'post not leader')

    legislators[0]._whenCollapse(time)
    legislators[1]._whenCollapse(time)

    assert(!legislators[0].enqueue(time, 1, {}).enqueued, 'post collapsed')

    tick()

    assert(legislators[0].government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [],
        promise: '5/0',
        map: null,
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0' }
        }
    }, 'recover from collapse')

    legislators[0].pings[1].timeout = 1

    legislators[0]._whenKeepAlive(time)

    tick()

    assert(legislators[0].pings[1].timeout, 0, 'liveness pulse')

    legislators[1]._whenPing(time, '2')

    assert(legislators[1].pings[2].timeout, 1, 'liveness ping timeout set')

    tick()

    assert(legislators[1].pings[2].timeout, 0, 'liveness ping resolved')

    delete legislators[1].pings[2]

    legislators[1]._whenPing(time, '2')

    tick()

    assert(legislators[1].pings[2].timeout, 0, 'liveness ping materialized')

    legislators.push(legislator = new Legislator('3', options))
    legislator.join(time, 1)
    legislators[0].immigrate(time, 1, '3', legislators[3].cookie, { location: '3' })
    legislators.push(legislator = new Legislator('4', options))
    legislator.join(time, 1)
    legislators[0].immigrate(time, 1, '4', legislators[4].cookie, { location: '4' })
    legislators[0].enqueue(time, 1, { type: 'enqueue', value: 2 })

    while (send(legislators[0]));

    assert(legislators[3].log.head.body.body.promise, '0/0', 'log before naturalization')

    tick()

    assert(legislators[3].least.node.next.peek().promise, '6/0', 'log after naturalization')
    assert(legislators[3].log.head.body.body.promise, '7/1', 'log after naturalization')

    legislators[0].enqueue(time, 1, { type: 'enqueue', value: 2 })
    legislators[0].enqueue(time, 1, { type: 'enqueue', value: 3 })

    tick()

    // One more post to propagate the pings to the new memebers back to the
    // leader. TODO Do this by advancing clock to test pings.
    legislators[0].enqueue(time, 1, { type: 'enqueue', value: 3 })

    tick()

    time++
    tick()

    time++
    tick()

    // TODO Always include exiles and naturalization empty and null by default.
    assert(legislators[0].government, {
        majority: [ '0', '1', '2' ],
        minority: [ '3', '4' ],
        constituents: [],
        promise: 'a/0',
        map: {},
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2', '6/0': '3', '7/0': '4' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0', '3': '6/0', '4': '7/0' }
        }
    }, 'five member parliament')


    legislators[0].enqueue(time, 1, { type: 'enqueue', value: 3 })

    legislators[1].collapse(time)

    send(legislators[1])

    legislators[1]._nudge(time)

    tick({ 1: 'isolate' })

    time++
    tick({ 1: 'isolate' })

    assert(legislators[0].government, {
        majority: [ '0', '2', '3' ],
        minority: [ '1', '4' ],
        constituents: [],
        promise: 'b/0',
        map: null,
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2', '6/0': '3', '7/0': '4' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0', '3': '6/0', '4': '7/0' }
        }
    }, 'recover from isolation')
    return

    time++
    legislators[2].scheduler.check(time)
    tick()

    receive(legislators[1], consensus)

    // Test inability to create new government because of lack of majority.
    legislators[0].collapse(time)

    assert(legislators[0].consensus(), null, 'cannot choose leaders')

    tick()

    // Immigrate, but then restart, and assert that the restarted legislator
    // does not immigrate. (I don't see a test for success here.)
    legislators.push(legislator = new Legislator('5', options))
    legislator.join(time, 1)
    legislators[0].immigrate(time, 1, '5', legislators[5].cookie, { location: '5' })

    tick({ 5: 'isolate' })

    time++

    legislators[1].scheduler.check(time)
    send(legislators[1])
    legislators[5] = new Legislator('5', options)
    legislators[5].join(time, 1)
    tick()

    legislators[0].collapse()
    send(legislators[0])
    send(legislators[0])
    legislators[2].collapse()
    tick({ 0: 'isolate' })
    tick()

    assert(legislators[2].islandId, 1, 'island id')
}
