require('proof')(3, prove)

function prove (okay) {
    var Proposer = require('../proposer')
    var Legislator = require('../legislator')

    var queue = []
    var government = { majority: [ '0', '1' ], minority: [ '2' ] }
    var proposer = new Proposer(government, '1/0', queue)
    var legislators = government.majority.concat(government.minority).map(function (id) {
        return new Legislator('1/0', id)
    })

    proposer.prepare()

    var pulse = proposer.queue.shift()

    okay(pulse, {
        to: [ '0', '1' ],
        method: 'prepare',
        promise: '2/0'
    }, 'propose')

    function transmit (pulse) {
        var responses = {}
        pulse.to.forEach(function (id) {
            responses[id] = legislators[id].request(pulse)
        })
        proposer.response(pulse, responses)
    }

    transmit(pulse)

    pulse = proposer.queue.shift()

    okay(pulse, {
        method: 'accept',
        to: [ '0', '1' ],
        promise: '2/0',
        value: { majority: [ '0', '1' ], minority: [ '2' ] },
        previous: null
    }, 'accept')

    transmit(pulse)

    pulse = proposer.queue.shift()

    okay(pulse, {
        method: 'commit',
        to: [ '0', '1' ],
        promise: '2/0'
    }, 'commit')
}
