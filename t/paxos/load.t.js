#!/usr/bin/env node
require('proof')(1, function(equal) {
    var paxos = require('../../index.js')
    var cluster = new paxos.Cluster([])
    var node = paxos.initializeFromFile('./t/paxos/proposer.json', function (n) {
        if (n) return n+1
        return 1
    })

    equal(node, node.messenger.node, "Node initialized")
    node.end()
})
