
require('proof')(7, prove)

function prove (assert) {
    var Legislator = require('../../legislator'),
        Network = require('../../synchronous/network'),
        Machine = require('../../synchronous/machine')

    var legislators = [ new Legislator(0) ]
    legislators[0].bootstrap()

    function logger (count, id, message) {
        console.log(count, id, message)
    }

    var network = new Network
    var machine = new Machine(network, legislators[0], logger)
    network.machines.push(machine)

    // Legislator.synchronous(legislators, 0, logger)

    network.tick()

    assert(legislators[0].government, {
        id: '1/0', leader: 0, majority: [ 0 ], minority: [], members: [ 0 ], interim: false
    }, 'bootstrap')

    network.machines.push(new Machine(network, new Legislator(1), logger))

    network.machines[1].legislator.sync([ 0 ], 20)
    network.tick()

    assert(network.machines[1].legislator.government, {
        id: '1/0', leader: 0, majority: [ 0 ], minority: [], members: [ 0 ], interim: false
    }, 'synchronize join')

    // todo: yes, you look inside the response. it is not opaque. you are at
    // this low level when you are trying to create an interface to an algorithm
    // that is uncommon and subtle.
    var cookie = network.machines[1].legislator.naturalize()
    assert(cookie, 1, 'cookie')
    network.tick()

    assert(legislators[0].government, {
        id: '2/0', leader: 0, majority: [ 0, 1 ], minority: [], members: [ 0, 1 ], interim: false
    }, 'grow')

    assert(network.machines[1].legislator.government, {
        id: '2/0', leader: 0, majority: [ 0, 1 ], minority: [], members: [ 0, 1 ], interim: false
    }, 'cleanup pulse')

    network.machines.push(new Machine(network, new Legislator(2), logger))
    network.machines[2].legislator.sync([ 0 ], 20)
    network.tick()

    assert(network.machines[2].legislator.government, {
        id: '2/0', leader: 0, majority: [ 0, 1 ], minority: [], members: [ 0, 1 ], interim: false
    }, 'cleanup pulse')

    network.machines[2].legislator.naturalize()
    network.tick()

    assert(network.machines[1].legislator.government, {
        id: '3/0', leader: 0, majority: [ 0, 1 ], minority: [ 2 ], members: [ 0, 1, 2 ], interim: false
    }, 'cleanup pulse')
}
