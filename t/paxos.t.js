require('proof')(6, prove)

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
        to: '0', method: 'accept', promise: '2/0', value: { majority: [ '0', '1' ], minority: [ '2' ] }
    }, {
        to: '1', method: 'accept', promise: '2/0', value: { majority: [ '0', '1' ], minority: [ '2' ] }
    }], 'accept')

    var commit = []
    accept.forEach(function (message) {
        var responses = []
        legislators[+message.to].recieve(message, responses)
        responses.forEach(function (response) {
            proposer.recieve(response, commit)
        })
    })

    // TODO Wha?
    /*
    okay(commit, {
        to: '0', method: 'commit', promise: '2/0'
    }, {
        to: '1', method: 'commit', promise: '2/0'
    }, 'commit')
    */

    okay(commit, [{
        to: '0', method: 'commit', promise: '2/0'
    }, {
        to: '1', method: 'commit', promise: '2/0'
    }], 'commit')

    var done = []
    commit.forEach(function (message) {
        var responses = []
        legislators[+message.to].recieve(message, responses)
        responses.forEach(function (response) {
            proposer.recieve(response, done)
        })
    })

    okay(done, [], 'done')
    okay(proposer.state, 'committed', 'proposer committed')
    okay(legislators.map(function (legislator) {
        return legislator.committed
    }), [ true, true, false ], 'legislator committed')
}
