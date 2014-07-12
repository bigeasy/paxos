#!/usr/bin/env node
require('proof')(1, function(equal) {
    var paxos = require('../../index.js')
    var nodes = []

    var generateProposalId = function (n) {
        if (n) return n+1;
        return 1;
    }

    var cluster = new paxos.Cluster(nodes)

    for (var i=0; i<5; i++) {
        nodes[i] = new paxos.Node(i, '127.0.0.1', 80+i, generateProposalId, 1)
        if (i < 1) {
            paxos.initializeProposer(nodes[i], cluster)
        } else {
            paxos.initializeAcceptor(nodes[i], cluster)
        }

        if (i == 2) {
            nodes[i].promisedId = 20
            nodes[0].startProposal("jump")
        }
    }


    equal(nodes[0].proposalId, 21, 'NACK received') // TODO: ask Alan how to do the thing
})
