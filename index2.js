
function Node (id) { // :: Int -> Node
  this.id = id
  this.acceptors = []
  this.proposal = null
  this.value = null
  this.stateLog = []
  this.roles = []
}

function Cluster (nodes) { // :: [Node] -> Cluster
  this.nodes = nodes
  this.learners = []
  this.acceptors = []
  this.proposers = []
  if (nodes) {
    nodes.ForEach(function (node, _, __) {
     if (node.roles.indexOf('Learner') > -1) {
      this.learners.push(node.id)
     } else if (nodes.roles.indexOf('Acceptor') > -1) {
      this.acceptors.push(node.id)
     } else if (nodes.roles.indexOf('Proposer') > -1) {
      this.proposers.push(node.id)
     }
    })
  }
}


function initializeProposer (node, cluster, initProposal) { // :: Node -> Cluster -> [Char] ->
  node.roles.push('Proposer')
  node.propose = function (proposal) {}
  if (initProposal) { node.propose(initProposal) }
}

function initializeAcceptor (node, cluster) { // :: Node -> Cluster ->
  node.roles.push('Acceptor')
  // Sync stateLog with acceptors in cluster
}

function initializeLearner (node, cluster) { // :: Node -> Cluster ->
  node.roles.push('Learner')
}
