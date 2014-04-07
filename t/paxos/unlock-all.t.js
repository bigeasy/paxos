#!/usr/bin/env node

require('proof')(2, function (equal, say) {
    var paxos = require('../..')
    var messages = [ "foo", "bar", "baz" ]
    var acceptor1 = new paxos.acceptor(0, 300)
    var acceptor2 = new paxos.acceptor(0, 400)
    var proposers = []

    for (var i = 0; i < messages.length; i++) {
        proposers.push(new paxos.proposer(i+1, i * i))
        proposers[i].addAcceptors( [acceptor1, acceptor2] )
        proposers[i].send(messages[i])
    }
    acceptor1.addLearners( [acceptor2] )
    acceptor1.unlock('all')
    proposers[2].send('whoops')

    equal(acceptor1.message, 'whoops', 'first unlocked')
    equal(acceptor2.message, 'whoops', 'second unlocked')
})
