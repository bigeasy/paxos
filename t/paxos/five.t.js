
require('proof')(2, prove)

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
    network.machines.push(new Machine(network, new Legislator(0, options)))
    network.machines[0].legislator.bootstrap()
    network.tick()

    network.machines.push(new Machine(network, new Legislator(1, options)))
    network.machines[1].legislator.sync([ 0 ], 20)
    network.tick()
    network.machines[1].legislator.naturalize()
    network.tick()

    network.machines.push(new Machine(network, new Legislator(2, options)))
    network.machines[2].legislator.sync([ 0 ], 20)
    network.tick()
    network.machines[2].legislator.naturalize()
    network.tick()

    network.machines.push(new Machine(network, new Legislator(3, options)))
    network.machines[3].legislator.sync([ 0 ], 20)
    network.tick()
    network.machines[3].legislator.naturalize()
    network.tick()

    network.machines.push(new Machine(network, new Legislator(4, options)))
    network.machines[4].legislator.sync([ 0 ], 20)
    network.tick()
    network.machines[4].legislator.naturalize()
    network.tick()

    network.machines.push(new Machine(network, new Legislator(5, options)))
    network.machines[5].legislator.sync([ 0 ], 20)
    network.tick()
    network.machines[5].legislator.naturalize()
    network.tick()

    network.machines.push(new Machine(network, new Legislator(6, options)))
    network.machines[6].legislator.sync([ 0 ], 20)
    network.tick()
    network.machines[6].legislator.naturalize()
    network.tick()

    assert(network.machines[3].legislator.government,
        { majority: [ 0, 1, 3 ], minority: [ 2, 4 ], id: '5/0' }, 'five and two')

    var gremlin = network.addGremlin(function (when, route, index) {
        return route.path[index] == 4
    })

    time++

    network.machines[1].legislator.ticks[3] = time
    network.machines[1].legislator.ticks[2] = time

    network.machines[1].legislator.reelect()

    network.machines[3].legislator.ticks[1] = time
    network.machines[3].legislator.ticks[2] = time

    network.tick()

    network.removeGremlin(gremlin)

    network.machines[4].legislator.outcomes.length = 0
    var cookie = network.machines[4].legislator.post({ value: 1 })
    network.tick()
    assert(
        network.machines[4].legislator.outcomes,
        [ { type: 'posted', cookie: '2', statusCode: 410 } ], 'leader moved')

    return
    var gremlin = network.addGremlin(function (when, route, index) {
        return route.path[index] == 4
    })

    for (var i = 0; i < 31; i++) {
        network.machines[0].legislator.post({ value: i })
    }
    network.tick()
}
