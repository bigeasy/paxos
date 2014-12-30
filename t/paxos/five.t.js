
require('proof')(4, prove)

function prove (assert) {
    var Legislator = require('../../legislator'),
        Network = require('../../synchronous/network'),
        Machine = require('../../synchronous/machine')

    var time = 0

    var options = {
        clock: function () { return time },
        timeout: 1,
        size: 5,
        filter: logger
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

    var network = new Network
    network.machines.push(new Machine(network, new Legislator('0', options)))
    network.machines[0].legislator.bootstrap()
    network.tick()

    network.machines.push(new Machine(network, new Legislator('1', options)))
    network.tick()
    network.machines[0].legislator.naturalize('1')
    network.tick()

    network.machines.push(new Machine(network, new Legislator('2', options)))
    network.tick()
    network.machines[0].legislator.naturalize('2')
    network.tick()

    network.machines.push(new Machine(network, new Legislator('3', options)))
    network.tick()
    network.machines[0].legislator.naturalize('3')
    network.tick()

    network.machines.push(new Machine(network, new Legislator('4', options)))
    network.tick()
    network.machines[0].legislator.naturalize('4')
    network.tick()

    network.machines.push(new Machine(network, new Legislator('5', options)))
    network.tick()
    network.machines[0].legislator.naturalize('5')
    network.tick()

    network.machines.push(new Machine(network, new Legislator('6', options)))
    network.tick()
    network.machines[0].legislator.naturalize('6')
    network.tick()

    network.machines[0].legislator.naturalize('3')
    network.tick()

    assert(network.machines[0].legislator.government,
        { majority: [ 0, 1, 3 ], minority: [ 2, 4 ], id: '5/0' }, 'five and two')

    var gremlin = network.addGremlin(function (when, route, index) {
        return route.path[index] == 4
    })

    time++

    network.machines[1].legislator.ticks[3] = time
    network.machines[1].legislator.ticks[2] = time

    network.machines[1].legislator.whenReelect()

    network.machines[3].legislator.ticks[1] = time
    network.machines[3].legislator.ticks[2] = time

    network.tick()

    network.removeGremlin(gremlin)

    time++
    network.tick()

    assert(network.machines[4].legislator.government, {
        majority: [ '1', '3', '2' ],
        minority: [ '0', '4' ],
        id: '6/0'
    }, 'caught up')

    var gremlin = network.addGremlin(function (when, route, index) {
        return route.path[index] == '4'
    })

    for (var i = 0; i < 31; i++) {
        network.machines[1].legislator.post({ value: i })
    }
    network.tick()

    network.removeGremlin(gremlin)

    time++
    network.machines[3].legislator.newGovernment({
        majority: [ '3', '0', '4' ],
        minority: [ '1', '2' ]
    })
    network.machines[4].legislator.promise = { id: '11/0', quorum: [] }
    network.tick()

    assert(network.machines[3].legislator.government, {
        majority: [ '1', '3', '2' ],
        minority: [ '0', '4' ],
        id: '6/0'
    }, 'proposal out of sync')
    network.machines[3].legislator.newGovernment({
        majority: [ '3', '0', '4' ],
        minority: [ '1', '2' ]
    })
    network.tick()
    assert(network.machines[3].legislator.government, {
        majority: [ '3', '0', '4' ],
        minority: [ '1', '2' ],
        id: '12/0'
    }, 'proposal synced')
}
