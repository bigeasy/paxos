#!/usr/bin/env node
require('proof')(1, function(step) {
    var paxos = require('../../index.js')
    var generateProposalId = function (n) {
        if (n) return n+1;
        return 1;
    }

    var node1 = new paxos.Node({
        id: 2,
        address: '0.0.0.0',
        port: 1026,
        generateProposalId: generateProposalId,
        multi: false,
        currentRound: 1
    })
    paxos.initializeAcceptor(node1)
    var node2 = paxos.initializeFromFile('./t/paxos/proposer.json', generateProposalId, step())

}, function (equal) {
})
