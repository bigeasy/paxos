require('proof')(5, prove)

function prove (okay) {
    var Proposer = require('../proposer')
    var Acceptor = require('../acceptor')

    var queue = []
    var paxos = {
        _send: function (message) { queue.push(message) }
    }
    var government = { majority: [ '0', '1' ], minority: [ '2' ] }
    var proposer = new Proposer(paxos, government, '1/0')
    var acceptors = government.majority.concat(government.minority).map(function (id) {
        return new Acceptor('1/0', id, {
            _commit: function (now, entry) {
                okay(entry, {
                    promise: '2/0',
                    value: { majority: [ '0', '1' ], minority: [ '2' ] },
                    previous: null
                }, 'entry ' + id)
            }
        })
    })

    proposer.prepare(0)

    var pulse = queue.shift()

    okay(pulse, {
        method: 'prepare',
        to: [ '0', '1' ],
        sync: [],
        promise: '2/0'
    }, 'propose')

    function transmit (pulse) {
        var responses = {}
        pulse.to.forEach(function (id) {
            responses[id] = acceptors[id].request(0, pulse)
        })
        proposer.response(0, pulse, responses)
    }

    transmit(pulse)

    pulse = queue.shift()

    okay(pulse, {
        method: 'accept',
        to: [ '0', '1' ],
        sync: [],
        promise: '2/0',
        government: { majority: [ '0', '1' ], minority: [ '2' ] },
        previous: null
    }, 'accept')

    transmit(pulse)

    pulse = queue.shift()

    okay(pulse, {
        method: 'commit',
        to: [ '0', '1' ],
        sync: [],
        promise: '2/0'
    }, 'commit')

    transmit(pulse)
}
