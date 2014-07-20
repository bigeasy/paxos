#!/usr/bin/env node

var nodes = []
require('proof')(1, function (step) {
    // send NACK
    var paxos = require('../../index.js')
    var socket = require('dgram').createSocket("udp4")
    socket.bind(1024, '0.0.0.0')

    var generateProposalId = function (n) {
        if (n) return n+1;
        return 1;
    }

    var cluster = new paxos.Cluster(nodes)

    nodes[0] = new paxos.Node(1, '0.0.0.0', 1025, generateProposalId, 1)
    paxos.initializeProposer(nodes[0], cluster)
    nodes[0].startProposal("test")

    var nack = new Buffer(JSON.stringify({
        type: "NACK",
        address: '0.0.0.0',
        port: 1026,
        highestProposalNum: 2
    }))
    socket.send(nack, 0, nack.length, 1025, '0.0.0.0', function () {
        setTimeout(step(), 40000)
    })
}, function (equal) {
    equal(nodes[0].proposalId, 3, "proposal ID raised")
})
