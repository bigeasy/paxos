#!/usr/bin/env node

require('proof')(1, function (step) {
    // send NACK
    var nodes = []
    var paxos = require('../../index.js')
    var socket = require('dgram').createSocket("udp4")
    socket.bind(1024, '0.0.0.0')

    var generateProposalId = function (n) {
        if (n) return n+1;
        return 1;
    }

    var cluster = new paxos.Cluster(nodes)

    nodes[0] = new paxos.Node({
        id: 1,
        address: '127.0.0.1',
        port: 1025,
        generateProposalId: generateProposalId,
        multi: false,
        currentRound: 1
    })
    paxos.initializeProposer(nodes[0], cluster)
    nodes[0].startProposal("test", step())

    var nack = new Buffer(JSON.stringify({
        type: "NACK",
        address: '0.0.0.0',
        port: 1026,
        highestProposalNum: 2
    }))
    socket.send(nack, 0, nack.length, 1025, '0.0.0.0')
}, function (body, equal) {
    equal(body.newProposalId, 3, "proposal ID raised")
})
