require('proof')(4, prove)

function prove (okay) {
    var Proposer = require('../proposer')
    var Acceptor = require('../acceptor')

    var queue = []
    var paxos = {
        _send: function (message) { queue.push(message) },
        _commit: function (now, chain) {
            okay(chain, {
                promise: '2/0',
                body: { majority: [ '0', '1' ], minority: [ '2' ] },
                previous: null
            }, 'commit')
        },
        newGovernment: function (now, quorum, government) {
            okay({
                now: now,
                quorum: quorum,
                government: government
            }, {
                now: 0,
                quorum: [ '0', '1' ],
                government: {
                    majority: [ '0', '1' ],
                    minority: [ '2' ]
                }
            }, 'flush government')
        }
    }
    var government = { majority: [ '0', '1' ], minority: [ '2' ] }
    var proposer = new Proposer(paxos, '1/0')
    proposer.unshift({
        quorum: government.majority,
        body: government
    })
    var acceptors = government.majority.concat(government.minority).map(function (id) {
        return new Acceptor({ promise: '1/0', id: id, })
    })

    proposer.prepare(0)

    var pulse = queue.shift()

    okay(pulse, {
        method: 'prepare',
        version: [ '1/0', true ],
        to: [ '0', '1' ],
        sync: [],
        promise: '2/0'
    }, 'propose')

    function transmit (pulse) {
        var responses = {}
        pulse.to.forEach(function (id) {
            responses[id] = acceptors[id].request(0, pulse, {})
        })
        proposer.response(0, pulse, responses)
    }

    transmit(pulse)

    pulse = queue.shift()

    okay(pulse, {
        method: 'accept',
        version: [ '1/0', true ],
        to: [ '0', '1' ],
        sync: [],
        promise: '2/0',
        body: { majority: [ '0', '1' ], minority: [ '2' ] },
        previous: null
    }, 'accept')

    transmit(pulse)
}
