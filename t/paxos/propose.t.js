#!/usr/bin/env node

require('proof')(1, function (equal, say) {
    var paxos = require('../..').paxos
    var messages = [
        "the soup",
        "the dance",
        "the troops",
        "the fans"
    ]

    paxos = paxos(messages)

    equal(paxos, messages[0], 'match')
    say(paxos)
})
