require('proof')(1, function(ok) {
    var paxos = require('../../index.js')
    var nodes = []

    var generateProposalId = function (n) {
        if (n) return n+1;
        return 1;
    }

    var cluster = new paxos.Cluster(nodes)

    for (var i=0; i<6; i++) {
        nodes[i] = new paxos.Node(i, '127.0.0.1', 80+i, generateProposalId, 1)
        if (i < 2) {
            paxos.initializeProposer(nodes[i], cluster)
        } else if (i < 3) {
            paxos.initializeLearner(nodes[i], cluster)
        } else {
            paxos.initializeAcceptor(nodes[i], cluster)
        }
    }
    ok(cluster.quorum, 2)
})
