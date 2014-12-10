
require('proof')(15, prove)

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

    var defaults = new Legislator(0)
    assert(Date.now() - defaults.clock() < 250, 'default clock')

    var legislators = [ new Legislator(0, options) ]
    legislators[0].bootstrap()

    var network = new Network
    var machine = new Machine(network, legislators[0])
    network.machines.push(machine)

    network.tick(logger)

    assert(legislators[0].government, {
        id: '1/0', leader: 0, majority: [ 0 ], minority: [], interim: false
    }, 'bootstrap')

    network.machines.push(new Machine(network, new Legislator(1, options)))

    network.machines[1].legislator.sync([ 0 ], 20)
    network.tick(logger)

    assert(network.machines[1].legislator.government, {
        id: '1/0', leader: 0, majority: [ 0 ], minority: [], interim: false
    }, 'synchronize join')

    // todo: yes, you look inside the response. it is not opaque. you are at
    // this low level when you are trying to create an interface to an algorithm
    // that is uncommon and subtle.
    var cookie = network.machines[1].legislator.naturalize()
    assert(cookie, 1, 'cookie')
    network.tick(logger)

    assert(legislators[0].government, {
        id: '2/0', leader: 0, majority: [ 0, 1 ], minority: [], interim: false
    }, 'grow')

    network.machines.push(new Machine(network, new Legislator(2, options)))
    network.machines[2].legislator.sync([ 0 ], 20)
    network.tick(logger)

    assert(network.machines[2].legislator.government, {
        id: '2/0', leader: 0, majority: [ 0, 1 ], minority: [], interim: false
    }, 'sync')

    network.machines[2].legislator.naturalize()
    network.tick(logger)

    assert(network.machines[2].legislator.government, {
        id: '3/0', leader: 0, majority: [ 0, 1 ], minority: [ 2 ], interim: false
    }, 'three member parliament')

    assert(network.machines[1].legislator.government, {
        id: '3/0', leader: 0, majority: [ 0, 1 ], minority: [ 2 ], interim: false
    }, 'minority learning')

    network.machines.push(new Machine(network, new Legislator(3, options)))
    network.machines[3].legislator.sync([ 0 ], 20)
    network.tick(logger)

    assert(network.machines[3].legislator.government, {
        id: '3/0', leader: 0, majority: [ 0, 1 ], minority: [ 2 ], interim: false
    }, 'citizen learning')

    network.machines[3].legislator.naturalize()
    network.tick(logger)
    network.machines[1].legislator.outcomes.length = 0

    assert(network.machines[3].legislator.log.max(), {
        id: '3/2',
        accepts: [],
        learns: [ 1, 0 ],
        quorum: [ 0, 1 ],
        value: { type: 'naturalize', id: 3 },
        internal: true,
        cookie: '1',
        learned: true,
        decided: true,
        uniform: true
    }, 'citizen naturalized')

    time++
    network.machines[1].legislator.reelect()
    network.tick(logger)

    assert(network.machines[1].legislator.government, {
        id: '4/0', leader: 1, majority: [ 1, 2 ], minority: [ 0 ], interim: false
    }, 'reelection')

    var cookie = network.machines[1].legislator.post({ greeting: 'Hello, World!' })
    network.tick(logger)
    var outcome = network.machines[1].legislator.outcomes.shift()
    assert(outcome.type, 'posted', 'user message outcome')
    var entry = network.machines[1].legislator.log.find({ id: outcome.entry.id })
    assert(entry.value.greeting, 'Hello, World!', 'user message')

    var cookie = network.machines[1].legislator.post({ greeting: '¡hola mundo!' })
    network.tick(function (envelope) {
        if (envelope.to != 1 || envelope.from == 1) {
            return logger(envelope)
        } else {
            return []
        }
    })

    assert(network.machines[1].legislator.log.max(), {
        id: '4/3',
        accepts: [ 1 ],
        learns: [],
        quorum: [ 1, 2 ],
        value: { greeting: '¡hola mundo!' },
        internal: false,
        cookie: '3'
    }, 'leader unlearned')

    time++
    network.machines[2].legislator.reelect()
    network.tick(logger)

    assert(network.machines[1].legislator.log.max(), {
        id: '5/1',
        accepts: [],
        learns: [ 0, 2 ],
        quorum: [ 2, 0 ],
        value: {
            type: 'commence',
            government: {
                leader: 2,
                majority: [ 2, 0 ],
                minority: [ 1 ],
                interim: false,
                id: '5/0'
            }, terminus: '4/3'
        },
        internal: true,
        learned: true,
        decided: true,
        uniform: true
    }, 'former leader learned')

/*
    console.log(0, network.machines[0].legislator.log.find({ id: '4/3' }))
    console.log(0, network.machines[0].legislator.log.max())
    console.log(0, network.machines[1].legislator.log.find({ id: '4/3' }))
    console.log(0, network.machines[2].legislator.log.find({ id: '4/3' }))
 */
}
