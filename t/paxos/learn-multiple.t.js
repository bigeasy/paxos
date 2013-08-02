#!/usr/bin/env node

require('proof')(1, function (equal, say) {
    var paxos = require('../..')
      var messages = [
          "the soup",
          "the dance",
          "the troops",
          "the fans"
      ]
      var proposer = new paxos.proposer(1, 10)
      var acceptor = new paxos.acceptor(0, 20)
      var learners = []

      for (var i = 0; i < 5; i++) {
          learners.push(new paxos.acceptor(0,i))
      }
      acceptor.addLearners(learners)
      proposer.addAcceptors([ acceptor ])
      proposer.send(messages[0])

      equal(learners[4].message, messages[0], 'match')
})
