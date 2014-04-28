function Node (id, generateProposalId) { // :: Int -> (Int) -> Node
  this.id = id
  this.acceptors = {}
  this.proposal = null
  this.value = null
  this.stateLog = {}
  this.roles = []
  this.quorum = null
  this.generateProposalId = generateProposalId
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
  node.proposalId = null
  node.lastId = null
  node.promises = null
  node.nextProposalNum = 1
  node.setProposal = function (proposal) {
    if (node.proposal == null) {
      node.proposal = proposal
    }
  }
  if (initProposal) { node.setProposal(initProposal) }

  node.prepare = function () {
    node.promises = []
    node.nextProposalNum += 1
  }

  node.receivePromise = function (from, proposalId, lastAcceptedId, lastValue) {
    if (proposalId != node.proposalId || (node.promises.indexOf(from) > -1)) {
      return
    }

    node.promises.push(from)

    if  (lastAcceptedId > node.lastId) {
      node.lastId = last_acceptedId
      if (lastValue) { node.proposal = lastValue }
    }

    if (node.promises.length == node.quorom) {
      if (node.proposal) {
        //send accept request
      }
    }
  }

  // Needs to parse cluster information/join cluster, alert acceptors

}

function initializeAcceptor (node, cluster) { // :: Node -> Cluster ->
  node.roles.push('Acceptor')
  // Sync stateLog with acceptors in cluster
  node.promisedId = null
  node.acceptedId = null

  node.receivePrepare = function (from, proposalId) {
    if (proposalID == node.promisedId) {
      // send prepare message to other acceptors
    } else if (proposalId > node.promisedId) {
      node.promisedId = proposalId
      // send prepare
    }
  }

  node.receiveAcceptRequest = function (from, proposalId, proposal) {
    if (proposalId >= node.promisedId) {
      node.promisedId = proposalId
      node.acceptedId = proposalId
      node.value = proposal
      // alert other nodes that a value is accepted
    }
  }
}

function initializeLearner (node, cluster) { // :: Node -> Cluster ->
  node.finalValue = null
  node.proposals = {}
  node.roles.push('Learner')
  node.receiveAccept = function (from, proposalId, acceptedValue) {
    if (node.finalValue != null) {
      return
    }

    var last = node.acceptors[from]

    if (last > proposalId) { return }

    node.acceptors[from] = proposalId

    if (last) {
      oldProposal = node.proposals[last]
    }
  }
}
