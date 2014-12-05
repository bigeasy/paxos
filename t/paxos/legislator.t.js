
require('proof')(12, prove)

function prove (assert) {
    var Legislator = require('../../legislator'),
        Network = require('../../synchronous/network'),
        Machine = require('../../synchronous/machine')

    var time = 0

    var options = {
        clock: function () { return time },
        timeout: 1,
        size: 3
    }

    var legislators = [ new Legislator(0, options) ]
    legislators[0].bootstrap()

    function logger (count, id, message) {
        console.log(count, id, message)
    }

    var network = new Network
    var machine = new Machine(network, legislators[0], logger)
    network.machines.push(machine)

    network.tick()

    assert(legislators[0].government, {
        id: '1/0', leader: 0, majority: [ 0 ], minority: [], interim: false
    }, 'bootstrap')

    network.machines.push(new Machine(network, new Legislator(1, options), logger))

    network.machines[1].legislator.sync([ 0 ], 20)
    network.tick()

    assert(network.machines[1].legislator.government, {
        id: '1/0', leader: 0, majority: [ 0 ], minority: [], interim: false
    }, 'synchronize join')

    // todo: yes, you look inside the response. it is not opaque. you are at
    // this low level when you are trying to create an interface to an algorithm
    // that is uncommon and subtle.
    var cookie = network.machines[1].legislator.naturalize()
    assert(cookie, 1, 'cookie')
    network.tick()

    assert(legislators[0].government, {
        id: '2/0', leader: 0, majority: [ 0 ], minority: [ 1 ], interim: false
    }, 'grow')

    network.machines.push(new Machine(network, new Legislator(2, options), logger))
    network.machines[2].legislator.sync([ 0 ], 20)
    network.tick()

    assert(network.machines[2].legislator.government, {
        id: '2/0', leader: 0, majority: [ 0 ], minority: [ 1 ], interim: false
    }, 'sync')

    network.machines[2].legislator.naturalize()
    network.tick()

    assert(network.machines[2].legislator.government, {
        id: '3/0', leader: 0, majority: [ 0, 2 ], minority: [ 1 ], interim: false
    }, 'three member parliament')

    assert(network.machines[1].legislator.government, {
        id: '3/0', leader: 0, majority: [ 0, 2 ], minority: [ 1 ], interim: false
    }, 'minority learning')

    network.machines.push(new Machine(network, new Legislator(3, options), logger))
    network.machines[3].legislator.sync([ 0 ], 20)
    network.tick()

    assert(network.machines[3].legislator.government, {
        id: '3/0', leader: 0, majority: [ 0, 2 ], minority: [ 1 ], interim: false
    }, 'citizen learning')

    network.machines[3].legislator.naturalize()
    network.tick()
    network.machines[2].legislator.outcomes.length = 0

    assert(network.machines[3].legislator.log.max(), {
        id: '3/2',
        accepts: [],
        learns: [ 0, 2 ],
        quorum: [ 0, 2 ],
        value: { type: 'naturalize', id: 3 },
        internal: true,
        cookie: '1',
        learned: true,
        decided: true,
        uniform: true
    }, 'citizen naturalized')

    time++
    network.machines[2].legislator.reelect()
    network.tick()

    assert(network.machines[1].legislator.government, {
        id: '4/0', leader: 2, majority: [ 2, 1 ], minority: [ 0 ], interim: false
    }, 'reelection')

    var cookie = network.machines[2].legislator.post({ greeting: 'Hello, World!' })
    network.tick()
    var outcome = network.machines[2].legislator.outcomes.shift()
    assert(outcome.type, 'posted', 'user message outcome')
    var entry = network.machines[2].legislator.log.find({ id: outcome.entry.id })
    assert(entry.value.greeting, 'Hello, World!', 'user message')
}
