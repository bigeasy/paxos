var paxos = require('../../index.js')
var nodes = []

var generateProposalId = function (n) {
    if (n) return n+1;
    return 1;
}

var cluster = new paxos.Cluster(nodes)

for (var i=0; i<15; i++) {
    nodes[i] = new paxos.Node(i, '0.0.0.0', 1024+i, generateProposalId, 1)
    if (i < 5) {
        paxos.initializeProposer(nodes[i], cluster)
    }

    if (i < 10) {
        paxos.initializeLearner(nodes[i], cluster)
    } else {
        paxos.initializeAcceptor(nodes[i], cluster)
    }
    console.log(80+i)
}

nodes[2].startProposal("jump")
