require('proof')(6, prove)

function prove (assert) {
    var Legislator = require('../../legislator'),
        network = require('./transmission'),
        signal = require('signal')

    signal.subscribe('.bigeasy.paxos.invoke'.split('.'), function (id, method, vargs) {
         if (id == '0') {
            // console.log(JSON.stringify({ method: method, vargs: vargs }))
        }
    })

    function dump (legislator) {
        legislator.log.each(function (entry) { console.log(entry) })
    }

    var time = 0, gremlin

    var options = {
        Date: { now: function () { return time } },
        parliamentSize: 5,
        ping: 1,
        timeout: 2,
        retry: 5
    }

    var count = 0, util = require('util')

    assert(! new Legislator(time, '0').checkSchedule(time), 'empty schedule')
    var legislators = [ new Legislator(time, '0', options) ]
    legislators[0].bootstrap(time, '0')

    network.tick(time, legislators)

    assert(legislators[0].government, {
        majority: [ '0' ],
        minority: [],
        constituents: [],
        promise: '1/0'
    }, 'bootstrap')

    legislators.push(new Legislator(time, '1', options))

    assert(legislators[0].naturalize(time, '1', '1').posted, 'naturalize')
    network.tick(time, legislators)

    assert(legislators[0].government, {
        majority: [ '0' ],
        minority: [],
        naturalize: { id: '1', location: '1' },
        constituents: [ '1' ],
        promise: '2/0'
    }, 'leader and constituent pair')

    assert(legislators[1].log.size, 3, 'synchronized')

    legislators.push(new Legislator(0, '2', options))
    legislators[0].naturalize(time, '2', '2')
    network.tick(time, legislators)
    assert(legislators[0].government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [],
        promise: '4/0'
    }, 'three member parliament')
    return
    var post

    post = network.machines[1].legislator.post(time, null, { key: 'value' }, false)
    assert(!post.posted, 'post not leader')

    post = network.machines[0].legislator.post(time, null, { key: 'value' }, false)
    assert(post.posted, 'post')

    var transmission = transmit(time, network.machines.map(function (machine) {
        return machine.legislator
    }), network.machines[0].legislator)

    console.log(transmission.index, transmission.direction)
    transmission.consume(time)
    console.log(transmission.index, transmission.direction)
    transmission.consume(time)
    console.log(transmission.index, transmission.direction)

    return

    assert(network.machines[2].legislator.government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [],
        id: '2/0'
    }, 'minority learning')

    // TODO Is when necessary?
    gremlin = network.addGremlin(function (when, route, index) {
        return route.path[index] == '2'
    })
    network.machines[0].legislator.reelection(time)
    network.tick(time)
    network.removeGremlin(gremlin)

    assert(network.machines[1].legislator.government, {
        majority: [ '0' ],
        minority: [],
        constituents: [ '1', '2' ],
        id: '3/0'
    }, 'shrink parliament from 3 to 1')

    time++
    network.schedule(time)
    network.tick(time)
    network.machines[0].legislator.reelection(time)
    network.tick(time)

    assert(network.machines[1].legislator.government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [],
        id: '4/0'
    }, 'regrow')

    network.machines.push(new Machine(network, new Legislator('3', options)))
    network.machines[3].legislator.inject(network.machines[0].legislator.extract('backward', 20).entries)
    network.machines[3].legislator.initialize(time)
    network.machines[0].legislator.naturalize(time, '3', '3')
    network.tick(time)

    assert(!network.machines[0].legislator.checkSchedule(time), 'unexpired schedule')

    assert(network.machines[3].legislator.government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [ '3' ],
        id: '4/0'
    }, 'citizen learning')

    assert(network.machines[2].legislator.log.max(), {
        id: '4/1',
        accepts: [],
        decisions: [ '1', '0' ],
        quorum: [ '0', '1' ],
        cookie: null,
        value: { type: 'naturalize', id: '3', location: '3' },
        internal: true,
        decided: true,
        decreed: true,
        uniform: true
    }, 'citizen naturalized')

    time++
    time++
    network.machines[1].legislator.elect(time)
    network.tick(time)

    assert(network.machines[1].legislator.government, {
        majority: [ '1', '2' ],
        minority: [ '3' ],
        constituents: [ '0' ],
        id: '5/0'
    }, 'election')

    var post = network.machines[1].legislator.post(time, null, { greeting: 'Hello, World!' })
    assert(post.posted, 'user message outcome')
    network.tick(time)
    var entry = network.machines[1].legislator.log.find({ id: post.promise })
    assert(entry.value.greeting, 'Hello, World!', 'user message')

    network.machines[1].legislator.post(time, null, { greeting: '¡hola mundo!' })

    var direction = 'after'
    var gremlin = network.addGremlin(function (when, route, index) {
        if (direction == when && route.path[index - 1] == '1') {
            direction = 'before'
            return true
        }
    })

    network.tick(time)

    network.removeGremlin(gremlin)

    assert(network.machines[1].legislator.log.max(), {
        id: '5/2',
        accepts: [ '1' ],
        decisions: [],
        quorum: [ '1', '2' ],
        cookie: null,
        value: { greeting: '¡hola mundo!' },
        internal: false
    }, 'leader undecided')
    assert(network.machines[1].legislator.scheduler.what[1].value.type == 'elect', 'election planned')

    time++
    network.machines[2].legislator.elect(time)
    network.tick(time)

    assert(network.machines[1].legislator.log.max(), {
        id: '6/0',
        accepts: [],
        decisions: [ '3', '2' ],
        quorum: [ '2', '3' ],
        value: {
            type: 'convene',
            government: {
                majority: [ '2', '3' ],
                minority: [ '0' ],
                constituents: [ '1' ]
            },
            locations: { 0: '0', 1: '1', 2: '2', 3: '3' },
            terminus: '5/2'
        },
        internal: true,
        decided: true,
        decreed: true,
        uniform: true
    }, 'former leader decided')

    network.machines[2].legislator.post(time, null, { value: 1 })
    network.machines[2].legislator.post(time, null, { value: 2 })
    network.machines[2].legislator.post(time, null, { value: 3 })

    assert(network.machines[2].legislator.log.max().id, '6/1', 'rounds started')
    assert(network.machines[2].legislator.proposals.length, 2, 'queued')

    network.tick(time)

    assert(network.machines[2].legislator.log.max().id, '6/3', 'rounds complete')
    assert(network.machines[2].legislator.proposals.length, 0, 'queued')

    network.tick(time)

    assert(network.machines[2].legislator.proposals.length, 0, 'queue empty')
    assert(network.machines[1].legislator.log.max().value, { value: 3 }, 'rounds complete')

    // Test a election proposal race.
    time++
    network.machines[2].legislator.elect(time)
    network.machines[0].legislator.elect(time)

    network.machines[0].tick(time)
    network.tick(time)

    assert(network.machines[1].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '0' ],
        constituents: [ '1' ],
        id: '7/0'
    }, 'race resolved')

    assert(network.machines[3].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '0' ],
        constituents: [ '1' ],
        id: '7/0'
    }, 'race resolved, old majority member decided')

    network.machines[1].legislator.elect(time)
    network.tick(time)

    assert(network.machines[0].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '0' ],
        constituents: [ '1' ],
        id: '7/0'
    }, 'no election, nothing stale')

    network.machines[1].legislator.elect(time)
    network.tick(time)

    assert(network.machines[2].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '0' ],
        constituents: [ '1' ],
        id: '7/0'
    }, 'no election, not in majority')

    time++
    network.machines[3].legislator.elect(time)
    var gremlin = network.addGremlin(function (when, route, index) {
        return route.path[index] == '2'
    })
    network.tick(time)
    network.removeGremlin(gremlin)

    time++

    assert(network.machines[2].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '0' ],
        constituents: [ '1' ],
        id: '7/0'
    }, 'leader isolated')

    network.machines[3].legislator.post(time, null, { value: 1 })
    network.machines[3].tick(time)

    assert(network.machines[3].legislator.government, {
        majority: [ '3', '0' ],
        minority: [ '1' ],
        constituents: [ '2' ],
        id: '8/0'
    }, 'leader updated on pulse')

    network.machines[3].legislator.newGovernment([ '3', '0' ], {
        majority: [ '3', '0' ],
        minority: [ '1' ]
    })

    assert(network.machines[3].legislator.post(time, null, { value: 1 }).leader == null, 'post during election')
    assert(network.machines[1].legislator.post(time, null, { value: 1 }).leader, '3', 'post not leader')

    network.tick(time)

    network.machines[3].legislator.post(time, null, { value: 1 })

    network.machines[3].legislator.outbox(time).forEach(function (route, index) {
        if (!index) {
            assert(network.machines[3].legislator.outbox(time).length, 0, 'double outbox')
        }
        var forwards = network.machines[3].legislator.forwards(time, route, 0)
        var returns = network.machines[3].network.post(time, route, 1, forwards)
        network.machines[3].legislator.inbox(time, route, returns)
        network.machines[3].legislator.sent(time, route, forwards, returns)
    })

    network.tick(time)

    time++

    assert(network.machines[1].legislator.checkSchedule(time), 'ping scheduled')
    var routes = network.machines[1].legislator.outbox(time)
    assert(network.machines[1].legislator.outbox(time).length, 0, 'double unrouted outbox')
    assert(routes[0].id, '. -> 1 -> 2', 'ping route')
    var forwards = network.machines[1].legislator.forwards(time, routes[0], 0)
    assert(forwards[0].message.type, 'ping', 'ping message')
    routes.forEach(function (route) {
        network.machines[1].legislator.sent(time, route, forwards, [])
    })

    assert(network.machines[1].legislator.outbox(time).length, 0, 'ping done')

    time++

    assert(network.machines[1].legislator.checkSchedule(time), 'retry scheduled')
    var routes = network.machines[1].legislator.outbox(time)
    if (routes.length > 1) throw new Error
    assert(routes[0].id, '. -> 1 -> 2', 'retry route')
    var forwards = network.machines[1].legislator.forwards(time, routes[0], 0)
    var returns = network.post(time, routes[0], 1, forwards)
    assert(forwards[0].message.type, 'ping', 'retry message')
    network.machines[1].legislator.sent(time, routes[0], forwards, returns)

    assert(network.machines[1].legislator.outbox(time).length, 0, 'retry done')

    assert(network.machines[3].legislator.checkSchedule(time), 'leader ping scheduled')
    var routes = network.machines[3].legislator.outbox(time)
    assert(routes[0].id, '! -> 3 -> 0', 'leader ping route')
    var forwards = network.machines[3].legislator.forwards(time, routes[0], 0)
    assert(forwards[0].message.type, 'ping', 'retry message')
    routes.forEach(function (route) {
        network.machines[3].legislator.sent(time, route, forwards, [])
    })

    assert(!network.machines[3].legislator.checkSchedule(time), 'leader election with no schedule')
    var routes = network.machines[3].legislator.outbox(time)
    assert(routes[0].id, '. -> 3 -> 0', 'leader elect route')
    var forwards = network.machines[3].legislator.forwards(time, routes[0], 0)
    routes.forEach(function (route) {
        network.machines[3].legislator.sent(time, route, forwards, [])
    })

    time++
    time++
    network.tick(time)
    network.machines[3].legislator.checkSchedule(time)
    network.tick(time)

    var gremlin = network.addGremlin(function (when, route, index, envelopes) {
        return route.path[index] == '3'
    })
    time++
    time++
    assert(network.machines[0].legislator.checkSchedule(time), 'schedule election to test reject')
    network.tick(time)
    network.removeGremlin(gremlin)

    assert(network.machines[1].legislator.government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [ '3' ],
        id: 'b/0'
    }, 'reject election')

    assert(network.machines[3].legislator.post(time, null, { value: 1 }).posted, 'leader isolated')
    network.tick(time)
    assert(network.machines[3].legislator.government, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [ '3' ],
        id: 'b/0'
    }, 'previous leader rejected, decided election')

    var gremlin = network.addGremlin(function (when, route, index, envelopes) {
        return route.path[index] == '0'
    })
    time++
    time++
    assert(network.machines[1].legislator.checkSchedule(time), 'schedule election to test promised')
    network.tick(time)
    network.removeGremlin(gremlin)

    assert(network.machines[1].legislator.government, {
        majority: [ '1', '2' ],
        minority: [ '3' ],
        constituents: [ '0' ],
        id: 'c/0'
    }, 'promised election')

    network.machines[0].legislator.elect(time)
    network.tick(time)

    assert(network.machines[0].legislator.government, {
        majority: [ '1', '2' ],
        minority: [ '3' ],
        constituents: [ '0' ],
        id: 'c/0'
    }, 'previous leader informed of promise, decided election')

    var gremlin = network.addGremlin(function (when, route, index, envelopes) {
        return route.path[index] == '1'
    })
    time++
    time++
    assert(network.machines[2].legislator.checkSchedule(time), 'schedule election to test promised greater than')
    network.tick(time)
    network.machines[2].legislator.elect(time)
    network.machines[2].legislator.elect(time) // test elect during election
    network.machines[0].legislator.elect(time) // test elect of non-majority member
    network.tick(time)
    network.machines[2].legislator.elect(time)
    network.tick(time)
    network.removeGremlin(gremlin)

    assert(network.machines[3].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '0' ],
        constituents: [ '1' ],
        id: 'f/0'
    }, 'promised greater than election')

    network.machines[1].legislator.elect(time)
    network.tick(time)

    assert(network.machines[3].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '0' ],
        constituents: [ '1' ],
        id: 'f/0'
    }, 'previous leader informed of promise greater than, decided election')

    var gremlin = network.addGremlin(function (when, route, index, envelopes) {
        return route.path[index] == '0'
    })

    for (var i = 0; i < 30; i++) {
        network.machines[2].legislator.post(time, null, { value: i })
    }
    network.tick(time)
    network.removeGremlin(gremlin)

    network.machines[2].legislator.newGovernment([ '2', '0' ], {
        majority: [ '2', '0' ],
        minority: [ '3' ]
    })
    network.tick(time)
    assert(network.machines[2].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '0' ],
        constituents: [ '1' ],
        id: '11/0'
    }, 'retried election because member out of sync')

    var gremlin = network.addGremlin(function (when, route, index, envelopes) {
        return envelopes.some(function (envelope) { return envelope.message.type == 'prepare' })
    })
    network.machines[2].legislator.elect(time)
    network.tick(time)
    network.removeGremlin(gremlin)
    assert(network.machines[2].legislator.scheduler.what[2].value.type, 'elect', 'failed to form government')

    time++
    time++
    assert(network.machines[2].legislator.checkSchedule(time), 'retry election')
    network.tick(time)
    assert(network.machines[2].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '1' ],
        constituents: [ '0' ],
        id: '13/0'
    }, 'retired election')

    var post = network.machines[2].legislator.post(time, '1/2', { value: 1 })
    network.machines[2].legislator.post(time, null, { value: 2 })
    network.machines[2].legislator.post(time, null, { value: 3 })
    network.machines[2].legislator.reelection(time)
    network.machines[2].legislator.post(time, null, { value: 4 })
    network.machines[2].legislator.post(time, null, { value: 5 })
    network.machines[2].legislator.post(time, null, { value: 6 })

    network.tick(time)
    assert(network.machines[2].legislator.log.find({ id: '14/0' }).value,
    { type: 'convene',
      government:
       { majority: [ '2', '3' ],
         minority: [ '1' ],
         constituents: [ '0' ]
       },
      locations: { 0: '0', 1: '1', 2: '2', 3: '3' },
      terminus: '13/4',
      map:
       [ { was: '13/5', is: '14/1' },
         { was: '13/6', is: '14/2' },
         { was: '13/7', is: '14/3' } ] }, 'remapped')

    assert(network.machines[3].legislator.log.find({ id: post.promise }).cookie,
        '1/2', 'cookie preserved')

    var gremlin = network.addGremlin(function (when, route, index, envelopes) {
        return envelopes.some(function (envelope) {
            var value = envelope.message.value
            return value && value.type == 'election'
        })
    })

    network.machines[2].legislator.post(time, null, { value: 1 })
    network.machines[2].legislator.post(time, null, { value: 2 })
    network.machines[2].legislator.post(time, null, { value: 3 })
    network.machines[2].legislator.reelection(time)
    network.machines[2].legislator.post(time, null, { value: 4 })
    network.machines[2].legislator.post(time, null, { value: 5 })
    network.machines[2].legislator.post(time, null, { value: 6 })

    network.tick(time)
    network.removeGremlin(gremlin)

    assert(network.machines[2].legislator.log.max().value,
    { type: 'convene',
      government:
      {  majority: [ '2', '3' ],
         minority: [ '1' ],
         constituents: [ '0' ]
      },
      locations: { 0: '0', 1: '1', 2: '2', 3: '3' },
      terminus: '14/6' }, 'not remapped')

    // min and since.
    assert(network.machines[2].legislator.min(), '1/0', 'min')
    assert(network.machines[2].legislator.since('4/0', 1), [
        { promise: '4/1', previous: '4/0', cookie: null, internal: true,
            value: { type: 'naturalize', id: '3', location: '3' }
        }
    ], 'since')
    assert(network.machines[2].legislator.since('4/0').length, 24, 'since default count')
    assert(network.machines[2].legislator.since('1/0', 1024).length, 70, 'since visit all')
    assert(!network.machines[3].legislator.since('1/0', 1024), 'since not found')

    // extract, inject and shift.
    assert(network.machines[0].legislator.prime('0/0'), [], 'prime not found')
    assert(network.machines[0].legislator.prime('1/0')[0], [{
        promise: '1/0',
        previous: null,
        internal: true,
        value: {
            type: 'convene',
            government: {
                majority: [ '0' ],
                minority: [],
                constituents: []
            },
            locations: { 0: '0' },
            terminus: '0/1'
        }
    }][0], 'prime')

    var extract
    extract = network.machines[0].legislator.extract('forward')
    assert(extract.next, '1/0', 'extract next')
    assert(network.machines[0].legislator.length, 71, 'entry count')

    assert(network.machines[0].legislator.shift(), 3, 'shift')
    assert(network.machines[0].legislator.length, 68, 'entry count after shift')
    extract = network.machines[0].legislator.extract('forward')
    assert(extract.next, '2/0', 'extract next after shift')

    extract = network.machines[0].legislator.extract('forward', 1, '1/0')
    assert(!extract.found, 'extract not found')

    network.machines.push(new Machine(network, new Legislator('4', options)))
    extract = {}
    do {
        extract = network.machines[0].legislator.extract('backward', 20, extract.next)
        network.machines[4].legislator.inject(extract.entries)
    } while (extract.next)
    network.machines[4].legislator.initialize(time)
    assert(network.machines[4].legislator.length, 68, 'entry count after complete copy')
    while (network.machines[0].legislator.shift() != 0) {}
    assert(network.machines[0].legislator.length, 1, 'entry count after shift everything')

    network.machines[2].legislator.naturalize(time, '4', '4')
    network.tick(time)
    assert(network.machines[2].legislator.government, {
        majority: [ '2', '3', '1' ],
        minority: [ '0', '4' ],
        constituents: [],
        id: '16/0'
    }, 'five member parliament')

    var gremlin = network.addGremlin(function (when, route, index, envelopes) {
        return route.path[index] == '1'
    })
    network.machines[2].legislator.reelection(time)
    network.tick(time)

    network.removeGremlin(gremlin)

    assert(network.machines[2].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '0' ],
        constituents: [ '1', '4' ],
        id: '17/0'
    }, 'shrink parliament from 5 to 3')

    network.machines[2].legislator.reelection(time)
    network.tick(time)

    assert(network.machines[2].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '0' ],
        constituents: [ '1', '4' ],
        id: '18/0'
    }, 'unable to grow')

    time++
    network.machines[2].legislator.reelection(time)
    network.tick(time)

    assert(network.machines[3].legislator.government, {
        majority: [ '2', '3', '1' ],
        minority: [ '0', '4' ],
        constituents: [],
        id: '19/0'
    }, 'regrow')

    gremlin = network.addGremlin(function (when, route, index) {
        return route.path[index] == 4
    })
    for (var i = 0; i < 5; i++ ) {
        time++
        network.machines[2].legislator.post(time, null, { value: 1 })
        network.tick(time)
    }
    time++
    network.machines[2].legislator.post(time, null, { value: 1 })
    network.machines[0].tick(time)
    network.machines[3].legislator.emigrate(time, '0')
    network.machines[2].tick(time)
    network.removeGremlin(gremlin)

    assert(network.machines[2].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '1', ],
        constituents: [ '0' ],
        id: '1a/0'
    }, 'legislator emigrate')

    network.machines[1].legislator.emigrate(time, '7')
    network.tick(time)

    assert(network.machines[3].legislator.government, {
        majority: [ '2', '3' ],
        minority: [ '1', ],
        constituents: [],
        id: '1b/0'
    }, 'constituent emigrate')

    assert(network.machines.every(function (machine) {
        return Object.keys(machine.legislator.failed).length == 0
    }), 'failures decided')

    network.machines[0].legislator.immigrate('0')
    network.machines[2].legislator.naturalize(time, '0', '0')
    network.machines[4].legislator.immigrate('4')
    network.machines[2].legislator.naturalize(time, '4', '4')
    network.tick(time)

    assert(network.machines[2].legislator.government, {
        majority: [ '2', '3', '1' ],
        minority: [ '0', '4' ],
        constituents: [],
        id: '1c/0'
    }, 'renaturalize')

    network.machines[2].legislator.emigrate(time, '2')
    network.tick(time)

    assert(network.machines[3].legislator.government, {
        majority: [ '3', '1' ],
        minority: [ '0' ],
        constituents: [ '4' ],
        id: '1d/0'
    }, 'leader emigrate')

    network.machines[3].legislator.emigrate(time, '1')
    network.tick(time)

    assert(network.machines[0].legislator.government, {
        majority: [ '3', '0' ],
        minority: [ '4' ],
        constituents: [],
        id: '1e/0'
    }, 'majority emigrate')

    var extract = network.machines[3].legislator.extract('forward', 20)
    network.machines.forEach(function (machine) {
        while (machine.legislator.shift()) { }
    })

    network.machines[1].legislator = new Legislator('1', options)
    network.machines[1].legislator.inject(extract.entries)
    network.machines[1].legislator.initialize(time)
    network.machines[3].legislator.naturalize(time, '1', '1')
    network.tick(time)

    assert(network.machines[0].legislator.government, {
        majority: [ '3', '0' ],
        minority: [ '4' ],
        constituents: [ '1' ],
        id: '1e/0'
    }, 'cannot make constituent uniform, not propagated yet')
    assert(network.machines[4].legislator.failed, { '1': {} }, 'cannot make constituent uniform')
    time++
    ; [ 3, 0, 4 ].forEach(function (index) {
        network.machines[index].legislator.checkSchedule(time)
    })
    network.tick(time)
    time++
    ; [ 3, 0, 4 ].forEach(function (index) {
        network.machines[index].legislator.checkSchedule(time)
    })
    network.tick(time)
    assert(network.machines[3].legislator.government, {
        majority: [ '3', '0' ],
        minority: [ '4' ],
        constituents: [],
        id: '1f/0'
    }, 'cannot make constituent uniform, propagated')

    assert([ 3, 0, 4 ].every(function (index) {
        return Object.keys(network.machines[index].legislator.failed).length == 0
    }), 'gap failures decided')

    network.machines[1].legislator = new Legislator('1', options)
    network.machines[1].legislator.inject(network.machines[3].legislator.extract('backward', 9).entries)
    network.machines[1].legislator.initialize(time)
    network.machines[3].legislator.naturalize(time, '1', '1')
    network.machines[2].legislator = new Legislator('2', options)
    network.machines[2].legislator.inject(network.machines[3].legislator.extract('backward', 9).entries)
    network.machines[2].legislator.initialize(time)
    network.machines[3].legislator.naturalize(time, '2', '2')
    network.tick(time)
    assert(network.machines[0].legislator.government, {
        majority: [ '3', '0', '4' ],
        minority: [ '1', '2' ],
        constituents: [],
        id: '20/0'
    }, 'restore five member parliament')

    for (var i = 0; i < 16; i++) {
        var index = network.machines.length
        network.machines.push(new Machine(network, new Legislator(String(index), options)))
        network.machines[index].legislator.inject(network.machines[3].legislator.extract('backward', 9).entries)
        network.machines[index].legislator.initialize(time)
        network.machines[3].legislator.naturalize(time, String(index), String(index))
    }
    network.tick(time)
    assert(network.machines[0].legislator.government, {
        majority: [ '3', '0', '4' ],
        minority: [ '1', '2' ],
        constituents: [
            '5', '6', '7', '8', '9', '10', '11', '12',
            '13', '14', '15', '16', '17', '18', '19', '20'
        ],
        id: '20/0'
    }, 'add a bunch of citizens')

    time++
    network.machines[3].legislator.reelection(time, '1')
    network.tick(time)

    assert(network.machines[0].legislator.government, {
        majority: [ '3', '0', '4' ],
        minority: [ '1', '2' ],
        constituents: [
            '5', '6', '7', '8', '9', '10', '11', '12',
            '13', '14', '15', '16', '17', '18', '19', '20'
        ],
        id: '20/0'
    }, 'call election with invalid member')
}
