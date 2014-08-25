#!/usr/bin/env node

require('proof')(1, function (step) {
  var paxos = require('../../index.js')

  var generateProposalId = function (n) {
      if (n) return n+1;
      return 1;
  }

  var nodes = []
  var cluster = new paxos.Cluster(nodes)

  for (var i=0; i<6; i++) {
      nodes[i] = new paxos.Node({
          id: i,
          address: '127.0.0.1',
          port: 1024+i,
          generateProposalId: generateProposalId,
          multi: false,
          currentRound: 1
      })
      if (i < 3) {
          paxos.initializeAcceptor(nodes[i], cluster)
      }

      if (i < 4) {
          paxos.initializeLearner(nodes[i], cluster)
      } else {
          paxos.initializeProposer(nodes[i], cluster)
          if (i == 5) {
              nodes[i].startProposal("sit", step())
          } else if (i == 6) {
              nodes[i].startProposal("jump")
          }
      }
  }
}, function (body, equal) {
    equal(body, "sit")
})
