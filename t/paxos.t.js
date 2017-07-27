require('proof')(2, prove)

function prove (okay) {
    var Proposer = require('../proposer')
    var Legislator = require('../legislator')

    var government = [ '0', '1', '2' ]
    var proposer = new Proposer(government.slice(), '1/0', '0')
    var legislators = government.map(function (id) {
        return new Legislator(government.slice(), '1/0', id)
    })

    var prepare = []

    proposer.prepare(prepare)

    okay(prepare, [{
        to: '0', method: 'prepare', promise: '2/0',
    }, {
        to: '1', method: 'prepare', promise: '2/0',
    }, {
        to: '2', method: 'prepare', promise: '2/0'
    }], 'prepare')

    var accept = []
    prepare.forEach(function (message) {
        var responses = []
        legislators[+message.to].recieve(message, responses)
        responses.forEach(function (response) {
            proposer.recieve(response, accept)
        })
    })

    okay(accept, [{
        to: '0', method: 'accept'
    }, {
        to: '1', method: 'accept'
    }], 'okay')
}
