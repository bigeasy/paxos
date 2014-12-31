
require('proof')(59, prove)

function prove (assert) {
    var Legislator = require('../../legislator'),
        Network = require('../../synchronous/network'),
        Machine = require('../../synchronous/machine')

    var time = 0

    var options = {
        clock: function () { return time },
        timeout: 1,
        size: 5,
        filter: logger,
        sleep: [ 1, 1 ],
        retry: 2
    }

    var count = 0
    function logger (envelope) {
        var message = {}
        for (var key in envelope) {
            if (key != 'message') {
                message[key] = envelope[key]
            }
        }
        for (var key in envelope.message) {
            message[key] = envelope.message[key]
        }
        // console.log(++count, message)
        return [ envelope ]
    }

    var defaults = new Legislator('0')
    assert(Date.now() - defaults.clock() < 250, 'default clock')

    var legislators = [ new Legislator('0', options) ]
    assert(!legislators[0].checkSchedule(), 'empty schedule')
    legislators[0].bootstrap()

    var network = new Network
    var machine = new Machine(network, legislators[0])
    network.machines.push(machine)

    network.tick()

    assert(legislators[0].government, {
        majority: [ '0' ],
        minority: [],
        constituents: [],
        id: '1/0'
    }, 'bootstrap')

    network.machines.push(new Machine(network, new Legislator('1', options)))

    assert(network.machines[0].legislator.naturalize('1').posted, 'naturalize')
    network.tick()

    assert(legislators[0].government, {
        majority: [ '0', '1' ],
        minority: [],
        constituents: [],
        id: '2/0'
    }, 'grow')

    network.machines.push(new Machine(network, new Legislator('2', options)))
    network.machines[0].legislator.naturalize('2')
    network.tick()

    assert(network.machines[1].legislator.government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [],
        id: '3/0'
    }, 'three member parliament')

    assert(network.machines[2].legislator.government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [],
        id: '3/0'
    }, 'minority learning')

    network.machines.push(new Machine(network, new Legislator('3', options)))
    network.machines[0].legislator.naturalize('3')
    network.tick()

    assert(!network.machines[0].legislator.checkSchedule(), 'unexpired schedule')

    assert(network.machines[3].legislator.government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [ '3' ],
        id: '3/0'
    }, 'citizen learning')

    assert(network.machines[2].legislator.log.max(), {
        id: '3/1',
        accepts: [],
        learns: [ '1', '0' ],
        quorum: [ '0', '1' ],
        value: { type: 'naturalize', id: '3' },
        internal: true,
        learned: true,
        decided: true,
        uniform: true
    }, 'citizen naturalized')

    time++
    network.machines[1].legislator.whenReelect()
    network.tick()

    assert(network.machines[1].legislator.government, {
        majority: [ '1', '2' ],
        minority: [ '3' ],
        constituents: [ '0' ],
        id: '4/0'
    }, 'reelection')

    var post = network.machines[1].legislator.post({ greeting: 'Hello, World!' })
    assert(post.posted, 'user message outcome')
    network.tick()
    var entry = network.machines[1].legislator.log.find({ id: post.promise })
    assert(entry.value.greeting, 'Hello, World!', 'user message')

    network.machines[1].legislator.post({ greeting: '¡hola mundo!' })

    var direction = 'after'
    var gremlin = network.addGremlin(function (when, route, index) {
        if (direction == when && route.path[index - 1] == '1') {
            direction = 'before'
            return true
        }
    })

    network.tick()

    network.removeGremlin(gremlin)

    assert(network.machines[1].legislator.log.max(), {
        id: '4/2',
        accepts: [ '1' ],
        learns: [],
        quorum: [ '1', '2' ],
        value: { greeting: '¡hola mundo!' },
        internal: false
    }, 'leader unlearned')
    assert(network.machines[1].legislator.events.what[1].type == 'reelect', 'reelection planned')

    time++
    network.machines[2].legislator.whenReelect()
    network.tick()

    assert(network.machines[1].legislator.log.max(), {
        id: '5/0',
        accepts: [],
        learns: [ '3', '2' ],
        quorum: [ '2', '3' ],
        value: {
            type: 'convene',
            government: {
                majority: [ '2', '3' ],
                minority: [ '0' ],
                constituents: [ '1' ],
                id: '5/0'
            }, terminus: '4/2'
        },
        internal: true,
        learned: true,
        decided: true,
        uniform: true
    }, 'former leader learned')

    network.machines[2].legislator.post({ value: 1 })
    network.machines[2].legislator.post({ value: 2 })
    network.machines[2].legislator.post({ value: 3 })

    assert(network.machines[2].legislator.log.max().id, '5/1', 'rounds started')
    assert(network.machines[2].legislator.proposals.length, 2, 'queued')

    network.tick()

    assert(network.machines[2].legislator.log.max().id, '5/3', 'rounds complete')
    assert(network.machines[2].legislator.proposals.length, 0, 'queued')

    network.tick()

    assert(network.machines[2].legislator.proposals.length, 0, 'queue empty')
    assert(network.machines[1].legislator.log.max().value, { value: 3 }, 'rounds complete')

    // Test a reelection proposal race.
    time++
    network.machines[2].legislator.whenReelect()
    network.machines[0].legislator.whenReelect()

    network.machines[0].tick()
    network.tick()

    assert(network.machines[1].legislator.government, {
        majority: [ '2', '0' ],
        minority: [ '1' ],
        constituents: [ '3' ],
        id: '6/0'
    }, 'race resolved')

    assert(network.machines[3].legislator.government, {
        majority: [ '2', '0' ],
        minority: [ '1' ],
        constituents: [ '3' ],
        id: '6/0'
    }, 'race resolved, old majority member learned')

    network.machines[1].legislator.whenReelect()
    network.tick()

    assert(network.machines[0].legislator.government, {
        majority: [ '2', '0' ],
        minority: [ '1' ],
        constituents: [ '3' ],
        id: '6/0'
    }, 'no reelection, nothing stale')

    network.machines[1].legislator.whenReelect()
    network.tick()

    assert(network.machines[2].legislator.government, {
        majority: [ '2', '0' ],
        minority: [ '1' ],
        constituents: [ '3' ],
        id: '6/0'
    }, 'no reelection, not in majority')

    time++
    network.machines[0].legislator.whenReelect()
    var gremlin = network.addGremlin(function (when, route, index) {
        return route.path[index] == '2'
    })
    network.tick()
    network.removeGremlin(gremlin)

    time++

    assert(network.machines[2].legislator.government, {
        majority: [ '2', '0' ],
        minority: [ '1' ],
        constituents: [ '3' ],
        id: '6/0'
    }, 'leader isolated')

    network.machines[0].legislator.post({ value: 1 })
    network.machines[0].tick()

    assert(network.machines[0].legislator.government, {
        majority: [ '0', '1' ],
        minority: [ '3' ],
        constituents: [ '2' ],
        id: '7/0'
    }, 'leader updated on pulse')

    network.machines[0].legislator.newGovernment([ '0', '1'], {
        majority: [ '0', '1' ],
        minority: [ '3' ]
    })

    assert(network.machines[0].legislator.post({ value: 1 }).leader == null, 'post during election')
    assert(network.machines[1].legislator.post({ value: 1 }).leader, '0', 'post not leader')

    network.tick()

    network.machines[0].legislator.post({ value: 1 })

    network.machines[0].legislator.outbox().forEach(function (route, index) {
        if (!index) {
            assert(network.machines[0].legislator.outbox().length, 0, 'double outbox')
        }
        var forwards = network.machines[0].legislator.forwards(route.path, 0)
        var returns = network.machines[0].network.post(route, 1, forwards)
        network.machines[0].legislator.inbox({ id: '0 -> 3', path: [ '0', '3' ] }, returns)
        network.machines[0].legislator.sent(route, forwards, returns)
    })

    network.tick()

    time++

    assert(network.machines[3].legislator.checkSchedule(), 'ping scheduled')
    var routes = network.machines[3].legislator.outbox()
    assert(network.machines[3].legislator.outbox().length, 0, 'double unrouted outbox')
    assert(routes[0].id, '3 -> 2', 'ping route')
    var forwards = network.machines[3].legislator.forwards(routes[0].path, 0)
    assert(forwards[0].message.type, 'ping', 'ping message')
    routes.forEach(function (route) {
        network.machines[3].legislator.sent(route, forwards, [])
    })

    assert(network.machines[3].legislator.outbox().length, 0, 'ping done')

    time++

    assert(network.machines[3].legislator.checkSchedule(), 'retry scheduled')
    var routes = network.machines[3].legislator.outbox()
    assert(routes[0].id, '3 -> 2', 'retry route')
    var forwards = network.machines[3].legislator.forwards(routes[0].path, 0)
    assert(forwards[0].message.type, 'ping', 'retry message')
    routes.forEach(function (route) {
        network.machines[3].legislator.sent(route, forwards, [])
    })

    assert(network.machines[3].legislator.outbox().length, 0, 'retry done')

    assert(network.machines[0].legislator.checkSchedule(), 'leader ping scheduled')
    var routes = network.machines[0].legislator.outbox()
    assert(routes[0].id, '0 -> 1', 'leader ping route')
    var forwards = network.machines[0].legislator.forwards(routes[0].path, 0)
    assert(forwards[0].message.type, 'ping', 'retry message')
    routes.forEach(function (route) {
        network.machines[0].legislator.sent(route, forwards, [])
    })

    assert(!network.machines[0].legislator.checkSchedule(), 'leader reelection with no schedule')
    var routes = network.machines[0].legislator.outbox()
    assert(routes[0].id, '0 -> 1', 'leader reelect route')
    var forwards = network.machines[0].legislator.forwards(routes[0].path, 0)
    routes.forEach(function (route) {
        network.machines[0].legislator.sent(route, forwards, [])
    })

    /*
    var gremlin = nework.addGremlin(function (when, route, index, envelopes) {
        return when == 'before' && route[index - 1] == '1' && envelopes.some(function (envelope) {
            return envelope.message.type == 'prepare'
        })
    })
    */
    time++
    network.tick()
    network.machines[0].legislator.checkSchedule()
    network.tick()
    var gremlin = network.addGremlin(function (when, route, index, envelopes) {
        return route.path[index] == '0'
    })
    time++
    assert(network.machines[1].legislator.checkSchedule(), 'schedule reelection to test reject')
    network.tick()
    network.removeGremlin(gremlin)

    assert(network.machines[1].legislator.government, {
        majority: [ '1', '2' ],
        minority: [ '3' ],
        constituents: [ '0' ],
        id: 'a/0'
    }, 'reject reelection')

    assert(network.machines[0].legislator.post({ value: 1 }).posted, 'leader isolated')
    network.tick()
    assert(network.machines[0].legislator.government, {
        majority: [ '1', '2' ],
        minority: [ '3' ],
        constituents: [ '0' ],
        id: 'a/0'
    }, 'previous leader rejected, learned reelection')

    var gremlin = network.addGremlin(function (when, route, index, envelopes) {
        return route.path[index] == '1'
    })
    time++
    assert(network.machines[2].legislator.checkSchedule(), 'schedule reelection to test promised')
    network.tick()
    network.removeGremlin(gremlin)

    assert(network.machines[2].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '0' ],
        constituents: [ '1' ],
        id: 'b/0'
    }, 'promised reelection')

    network.machines[1].legislator.whenReelect()
    network.tick()

    assert(network.machines[1].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '0' ],
        constituents: [ '1' ],
        id: 'b/0'
    }, 'previous leader informed of promise, learned reelection')

    var gremlin = network.addGremlin(function (when, route, index, envelopes) {
        return route.path[index] == '2'
    })
    time++
    assert(network.machines[3].legislator.checkSchedule(), 'schedule reelection to test promised greater than')
    network.machines[3].legislator.whenReelect()
    network.tick()
    network.machines[3].legislator.whenReelect()
    network.tick()
    network.machines[3].legislator.whenReelect()
    network.tick()
    network.removeGremlin(gremlin)

    assert(network.machines[3].legislator.government, {
        majority: [ '3', '0' ],
        minority: [ '1' ],
        constituents: [ '2' ],
        id: 'e/0'
    }, 'promised greater than reelection')

    network.machines[2].legislator.whenReelect()
    network.tick()

    assert(network.machines[1].legislator.government, {
        majority: [ '3', '0' ],
        minority: [ '1' ],
        constituents: [ '2' ],
        id: 'e/0'
    }, 'previous leader informed of promise greater than, learned reelection')

    var gremlin = network.addGremlin(function (when, route, index, envelopes) {
        return route.path[index] == '1'
    })

    for (var i = 0; i < 30; i++) {
        network.machines[3].legislator.post({ value: i })
    }
    network.tick()
    network.removeGremlin(gremlin)

    network.machines[3].legislator.newGovernment([ '3', '1' ], {
        majority: [ '3', '1' ],
        minority: [ '0' ]
    })
    network.tick()
    assert(network.machines[3].legislator.government, {
        majority: [ '3', '0' ],
        minority: [ '1' ],
        constituents: [ '2' ],
        id: '10/0'
    }, 'retried election because member out of sync')

    var gremlin = network.addGremlin(function (when, route, index, envelopes) {
        return envelopes.some(function (envelope) { return envelope.message.type == 'prepare' })
    })
    network.machines[3].legislator.whenReelect()
    network.tick()
    network.removeGremlin(gremlin)
    assert(network.machines[3].legislator.events.what[3].type, 'reelect', 'failed to form government')

    time++
    assert(network.machines[3].legislator.checkSchedule(), 'retry election')
    network.tick()
    assert(network.machines[3].legislator.government, {
        majority: [ '3', '0' ],
        minority: [ '1' ],
        constituents: [ '2' ],
        id: '12/0'
    }, 'retired election')
}
