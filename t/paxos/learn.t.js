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
      var learner = new paxos.acceptor(0, 4)

      proposer.addAcceptors([ acceptor ])

      acceptor.addLearner(learner)

      proposer.send(messages[0])

      equal(learner.message, messages[0], 'match')
})
