#!/usr/bin/env node

require('proof')(1, function (equal, say) {
    var paxos = require('../..')
    var messages = [
        "the soup",
        "the dance",
        "the troops",
        "the fans"
    ]

    var low_proposer = new paxos.proposer(1, 10)
    var high_proposer = new paxos.proposer(2, 5)
    var acceptor = new paxos.acceptor(0, 20)

    low_proposer.addAcceptors([ acceptor ])
    high_proposer.addAcceptors([ acceptor ])

    high_proposer.send(messages[0])
    low_proposer.send(messages[2])
    console.log(acceptor)

    equal(acceptor.message, messages[0], 'match')
})
