
function Node (id) { // :: Int -> Node
  this.id = id
  this.acceptors = []
  this.proposal = null
  this.value = null
  this.stateLog = []
  this.roles = []
  this.quorum = null
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
  node.proposal_id = null
  node.last_id = null
  node.promises = null
  node.next_proposal_num = 1
  node.setProposal = function (proposal) {
    if (node.proposal == null) {
      node.proposal = proposal
    }
  }
  if (initProposal) { node.setProposal(initProposal) }

  node.prepare = function () {
    node.promises = []
    node.proposal_id = generateProposalID()
    node.next_proposal_num += 1
  }

  node.receivePromise = function (from, proposal_id, last_accepted_id, last_value) {
    if (proposal_id != node.proposal_id || (node.promises.indexOf(from) > -1)) {
      return
    }

    node.promises.push(from)

    if  (last_accepted_id > node.last_id) {
      node.last_id = last_accepted_id
      if (last_value) { node.proposal = last_value }
    }

    if (node.promises.length == node.quorom) {
      if (node.proposal) {
        //send accept request
      }
    }
  }

}

function initializeAcceptor (node, cluster) { // :: Node -> Cluster ->
  node.roles.push('Acceptor')
  // Sync stateLog with acceptors in cluster
}

function initializeLearner (node, cluster) { // :: Node -> Cluster ->
  node.roles.push('Learner')
}

function generateProposalID () {}
