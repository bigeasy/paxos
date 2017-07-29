require('proof')(1, prove)

function prove (okay) {
    var Denizen = require('../paxos')
    var Legislator = require('../legislator')
    var Proposer = require('../proposer')

    var options = {
        parliamentSize: 5,
        ping: 1,
        timeout: 3,
        naturalized: true,
        shifter: true
    }

    function createDenizen (id) {
        var denizen = new Denizen(id, options)
        denizen.shifter = denizen.outbox.shifter()
        return denizen
    }

    var denizens = [ createDenizen('0') ]

    denizens[0]._bootstrap(0, 0, { a: 1 })

    okay(denizens[0].republic, 0, 'bootstrap')

    var proposal = denizens[0].proposals.shift()
    denizens[0].legislator = new Legislator(denizens[0].promise, denizens[0].id)
    var proposer = new Proposer(proposal.body.majority.concat(proposal.body.minority), denizens[0].promise)

    var prepare = []
    proposer.prepare(prepare)

    function consume (messages) {
        var subsequent = []
        messages.forEach(function (message) {
            var responses = []
            denizens[+message.to].legislator.receive(message, responses)
            responses.forEach(function (response) {
                proposer.receive(response, subsequent)
            })
        })
        return subsequent
    }

    var accept = consume(prepare)
}
