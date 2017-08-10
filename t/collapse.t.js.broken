require('proof')(7, prove)

function prove (assert) {
    function simplify (pulse) {
        return {
            type: pulse.type,
            route: pulse.route.slice(),
            messages: pulse.messages.map(function (message) {
                return message.type
            })
        }
    }
    var Network = require('./network')
    var network = new Network
    network.addDenizens(3)
    var outbox = network.denizens[0].outbox.shifter()
    network.denizens[0].collapse(network.time)
    network.denizens[0].scheduler.check(network.time)
    var pulse = outbox.shift()
    assert(simplify(pulse), {
        type: 'synchronize',
        route: [ '1' ],
        messages: [ 'pong', 'ping' ]
    }, 'ping 1')
    network.receive(network.denizens[0], pulse)
    pulse = outbox.shift()
    assert(simplify(pulse), {
        type: 'synchronize',
        route: [ '2' ],
        messages: [ 'pong', 'ping' ]
    }, 'ping 2')
    network.receive(network.denizens[0], pulse)
    pulse = outbox.shift()
    assert(simplify(pulse), {
        type: 'consensus',
        route: [ '0', '1' ],
        messages: [ 'propose' ]
    }, 'propose')
    network.receive(network.denizens[0], pulse)
    pulse = outbox.shift()
    assert(simplify(pulse), {
        type: 'consensus',
        route: [ '0', '1' ],
        messages: [ 'ping', 'minimum', 'accept' ]
    }, 'accept')
    network.receive(network.denizens[0], pulse)
    pulse = outbox.shift()
    assert(simplify(pulse), {
        type: 'consensus',
        route: [ '0', '1' ],
        messages: [ 'ping', 'commit' ]
    }, 'commit')
    network.receive(network.denizens[0], pulse)
    pulse = outbox.shift()
    assert(pulse, null, 'complete')
    assert(network.denizens[0].government,
    { majority: [ '0', '1' ],
      minority: [ '2' ],
      constituents: [],
      promise: '5/0',
      map: null,
      immigrated:
       { id: { '1/0': '0', '2/0': '1', '3/0': '2' },
         promise: { '0': '1/0', '1': '2/0', '2': '3/0' } },
      properties:
       { '0': { location: '0' },
         '1': { location: '1' },
         '2': { location: '2' } }
    }, 'government')
}
