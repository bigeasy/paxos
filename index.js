var dgram = require('dgram')

function Node (id, address, port, generateProposalId) { // :: Int -> Int -> (Int) -> Node
  this.socket = dgram.createSocket('udp4')
  this.id = id
  this.address = address
  this.port = port
  this.acceptors = {} // ID -> [address, last proposal]
  this.proposal = null
  this.value = null
  this.stateLog = {}
  this.roles = []
  this.quorum = null
  this.generateProposalId = generateProposalId
}

function Cluster (nodes) { // :: [Node] -> Cluster
  this.learners = {}
  this.acceptors = {}
  this.proposers = {}
  if (nodes) {
    nodes.ForEach(function (node, _, __) {
      this.addNode(node)
    }, this)
  }

  this.setQuorum = function () {
    if (this.acceptors.length % 2 == 0) {
      this.quorum = this.acceptors.length / 2 + 1
    } else {
      this.quorum = Math.ceil(Object.keys(this.acceptors).length / 2)
    }
    nodes.ForEach(function (node, _, _) {
      node.quorum = this.quorum
    }, this)()
  }

  this.addNode = function (node) {
    if (node.roles.indexOf('Learner') > -1) {
     this.learners[node.id] = node.address
    }
    if (node.roles.indexOf('Acceptor') > -1) {
     this.acceptors[node.id] = node.address
    }
    if (node.roles.indexOf('Proposer') > -1) {
     this.proposers[node.id] = node.address
    }
    for (var id in cluster.acceptors) {
      node.acceptors[id] = [cluster.acceptors[id], null]
    }
  }
}


function initializeProposer (node, cluster, initProposal) { // :: Node -> Cluster -> a ->
  node.roles.push('Proposer')
  node.proposalId = null
  node.lastId = null
  node.promises = []
  node.nextProposalNum = 1

  node.socket.bind(node.port, node.address)
  node.socket.on("message", function (message, rinfo) {
    message = JSON.parse(message.toString())
    if (message.type == "promise") {
      node.receivePromise(message.address, message.proposalId, message.lastAcceptedId, message.lastValue)
    }
  })

  node.setProposal = function (proposal, proposalId) {
    if ((node.proposal == null) || (proposalId !== node.proposalId)) {
      node.proposal = proposal
      node.proposalId = proposalId
    }
  }
  if (initProposal) { node.setProposal(initProposal) }

  node.prepare = function () {
    node.promises = []
    node.nextProposalNum += 1
  }

  node.receivePromise = function (from, proposalId, lastAcceptedId, lastValue) { // :: Int -> Int -> Int -> a ->
    if (proposalId != node.proposalId || (node.promises.indexOf(from) < 0)) {
      return
    }

    if (node.promises.indexOf(from) < 0) {
      node.promises.push(from)
    }

    if (lastAcceptedId > node.lastId) {
      node.lastId = last_acceptedId
      if (lastValue) { node.proposal = lastValue }
    }

    if (node.promises.length == node.quorom) {
      if (node.proposal) {
        acceptReq = new Buffer(JSON.stringify({
          type: "accept",
          proposalId: proposalId,
          proposal: node.proposal,
        }))
        node.socket.send(acceptReq, 0, from[0], from[1])
      }
    }
  }

  cluster.addNode(node)
  cluster.setQuorum()
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

  node.receiveAcceptRequest = function (from, proposalId, proposal) { // :: Int -> Int -> a ->
    if (proposalId >= node.promisedId) {
      node.promisedId = proposalId
      node.acceptedId = proposalId
      node.value = proposal
      // alert other nodes that a value is accepted
    }
  }
  cluster.addNode(node)
  cluster.setQuorum()
}

function initializeLearner (node, cluster) { // :: Node -> Cluster ->
  node.roles.push('Learner')
  node.finalValue = null
  node.finalProposalId = null

  node.proposals = {} // proposal ID -> [accept count, retain count, value]

  node.receiveAccept = function (from, proposalId, acceptedValue) { // :: Int -> Int -> a ->
    if (node.finalValue != null) {
      return
    }

    var last = node.acceptors[from]

    if (last > proposalId) { return }

    node.acceptors[from] = proposalId

    if (last) {
      oldProposal = node.proposals[last]
      oldProposal[1] -= 1
      if (oldProposal[1] == 0) { delete node.propoals[last] }
    }

    if (node.proposals[proposalId] == null) {
      node.proposals[proposalId] = [1, 1, acceptedValue]
    }

    if (node.proposals[proposalId][0] == node.quorum) { // round over
      node.finalValue = acceptedValue
      node.finalProposalId = proposalId
    }
  }
  cluster.addNode(node)
  cluster.setQuorum()
}
