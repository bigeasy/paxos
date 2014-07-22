#!/usr/bin/env node

require('proof')(1, function (step) {
  var paxos = require('../../index.js')

  var generateProposalId = function (n) {
      if (n) return n+1;
      return 1;
  }

  var nodes = []
  var cluster = new paxos.Cluster(nodes)

  for (var i=0; i<15; i++) {
      nodes[i] = new paxos.Node(i, '0.0.0.0', 1024+i, generateProposalId, 1)
      if (i < 5) {
          paxos.initializeAcceptor(nodes[i], cluster)
      }

      if (i < 10) {
          paxos.initializeLearner(nodes[i], cluster)
      } else {
          paxos.initializeProposer(nodes[i], cluster)
          if (i == 12) {
              nodes[i].startProposal("sit", step())
          } else if (i == 13) {
              nodes[i].startProposal("jump")
          } else if (i == 14) {
              nodes[i].startProposal("jump")
          }
      }
  }
}, function (body, equal) {
    equal(body, "sit")
})
