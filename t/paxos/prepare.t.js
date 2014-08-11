#!/usr/bin/env node

require('proof')(1, function(step) {
  var paxos = require('../../index.js')
  var nodes = []

  var generateProposalId = function (n) {
      if (n) return n+1;
      return 1;
  }

  var cluster = new paxos.Cluster(nodes)

  for (var i=0; i<15; i++) {
      nodes[i] = new paxos.Node({
          id: i,
          address: '127.0.0.1',
          port: 1024+i,
          generateProposalId: generateProposalId,
          currentRound: 1
      })
      if (i < 5) {
          paxos.initializeAcceptor(nodes[i], cluster)
      }

      if (i < 10) {
          paxos.initializeLearner(nodes[i], cluster)
      } else {
          paxos.initializeProposer(nodes[i], cluster)
      }
  }

  nodes[11].startProposal("jump", step())
}, function (body, equal) {
    console.log(body)
    equal(body.proposal, "jump")
})
