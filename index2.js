

function Node (id) { // :: Int -> Node
  this.id = id
  this.acceptors = []
  this.proposal = null
  this.value = null
  this.stateLog = []
  this.roles = []
}

function Cluster (nodes) {
  this.nodes = nodes
  this.learners = []
  this.acceptors = []
  this.proposers = []
  if (nodes) {
    nodes.ForEach(function (node, _, __) {
     if (node.roles.indexOf('Learner') > -1) {
      this.learners.push(node.id)
     } else if (nodes.roles..indexOf('Acceptor') > -1) {
      this.acceptors.push(node.id)
     } else if (nodes.roles..indexOf('Proposer') > -1) {
      this.proposers.push(node.id)
     }
    })
  }
}


function initializeProposer (node, cluster, initProposal) {
  node.roles.push('Proposer')
  node.propose = function (proposal) {}
  if (initProposal) { node.propose(initProposal) }
}

function initializeAcceptor (node, cluster) {
  node.roles.push('Acceptor')
  // Sync stateLog with acceptors in cluster
}

function initializeLearner (node, cluster) {
  node.roles.push('Learner')
}
