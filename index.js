var dgram = require('dgram')

function Messenger (node, port, address) {
//object to deal with networking.
//will contain a dgram socket.
//each node will own one messenger object.
    this.node = node
    this.port = port
    this.address = address
    this.socket = dgram.createSocket("udp4")
    this.socket.bind(address, port)
    this.sendAcceptRequest = function () {
        acceptReq = new Buffer(JSON.stringify({
            type: "accept",
            proposalId: this.node.proposalId,
            proposal: this.node.proposal,
            address: this.address,
            port: this.port
        }))
        for (var acceptor in this.node.acceptors) {
            this.socket.send(acceptReq, 0, node.acceptors[acceptor][0][0], node.acceptors[acceptor][0][1])
        }
    }
    this.sendPromise = function () {
        var promise = new Buffer(JSON.stringify({
            type: "promise",
            proposalId: this.node.promisedId,
            lastValue: this.node.lastAccepted,
            address: this.address,
            port: this.port
        }))
        this.socket.send(promise, 0, port, address)
    }
    this.sendPrepare = function () {
        var proposal = new Buffer(JSON.stringify({
            type: "prepare",
            address: this.node.address,
            port: this.node.port,
            nodeId: this.node.id,
            proposalId: this.node.proposalId
        }))
        this.sendToAcceptors(proposal)
    }
    this.sendNACK = function(address, port) {
        var nack = new Buffer(JSON.stringify({
            type: "NACK",
            address: this.address,
            port: this.port
        }))
        this.socket.send(nack, 0, port, address)
    }
    this.sendToAcceptors = function (message) {
        for (var acceptor in this.node.acceptors) {
            this.socket.send(message, 0, this.acceptors[acceptor][0][0], this.acceptors[acceptors][0][1])
        }
    }
    this.sendToLearners = function (message) {
        for (var learner in this.node.learners) {
            this.socket.send(message, 0, this.node.learners[learner][0][0], this.node.learners[learner][0][1])
        }
    }

    this.setMessageHandlers = function (role) {
      if (role == "Proposer") {
        this.socket.on("message", function (message, rinfo) {
            message = JSON.parse(message.toString())
            if (message.type == "promise") {
                this.node.receivePromise(message.id, message.proposalId, message.lastAcceptedId, message.lastValue)
            } else if (message.type == "proposal") {
                this.node.setProposal(message.proposal)
            } else if (message.type == "NAK") {
                this.node.prepare()
            } else if (message.type == "accepted") {
                this.node.recieveAccept()
            } else if (message.type == "known") {
                this.node.acceptors[message.nodeId] = [[message.nodePort, message.nodeAddress], message.nodeLastProposal]
                var index = this.node.waiting.indexOf(message.nodeId)
                if (index > -1) {
                    this.node.promises.push(message.nodeId)
                    this.node.waiting.splice(index, 1)
                }
            } else if (message.type == "NACK") {
                // increment proposal number and try again
            }
        })
      } else if (role == "Acceptor") {
        this.socket.on("message", function (message, rinfo) {
            message = JSON.parse(message.toString())
        // message types: prepare, accept
            if (message.type == "prepare") {
                this.node.receivePrepare(message.port, message.address, message.proposalId)
            } else if (message.type == "accept") {
                this.node.receiveAcceptRequest(message.proposalId, message.value)
            } else if (message.type == "identify") {
                // send back 'known' if address belongs to known acceptor
            }
        })
      } else if (role == "Learner") {
        this.socket.on("message", function (message, rinfo) {
            message = JSON.parse(message.toString())
            if (message.type == "accepted") {
                this.node.receiveAccept(message.from, message.proposalId, message.value)
            }
        })
      }
    }
}

function Node (id, address, port, generateProposalId, currentRound) { // :: Int -> Int -> Int -> Socket -> (Int) -> Node
    this.id = id
    this.address = address
    this.port = port
    this.acceptors = {} // ID -> [[port, address], last proposal]
    this.proposal = null
    this.value = null
    this.roles = []
    this.quorum = null
    this.generateProposalId = generateProposalId
    this.messenger = new Messenger(this, port, address)
    if (currentRound) {
        this.round = currentRound
    } else {
        this.round = 1
    }
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
        if (nodes) {
          nodes.ForEach(function (node, _, _) {
              node.quorum = this.quorum
          }, this)()
        }
    }

    this.addNode = function (node) {
        if (node.roles.indexOf('Learner') > -1) {
         this.learners[node.id] = [node.port, node.address]
        }
        if (node.roles.indexOf('Acceptor') > -1) {
         this.acceptors[node.id] = [node.port, node.address]
        }
        if (node.roles.indexOf('Proposer') > -1) {
         this.proposers[node.id] = [node.port, node.address]
        }
        for (var id in cluster.acceptors) {
            node.acceptors[id] = [cluster.acceptors[id], null]
        }
    }
}


function initializeProposer (node, cluster) { // :: Node -> Cluster -> a ->
    node.roles.push('Proposer')
    node.proposalId = null
    node.lastAcceptedId = null
    node.promises = []
    node.nextProposalNum = 1
    node.waiting = []
    node.messenger.setMessageHandlers('Proposer')


    node.startProposal = function (proposal) {
        node.promises = []
        node.proposal = proposal
        node.proposalId = node.generateProposalId()
        node.prepare()
    }

    node.prepare = function () {
        node.nextProposalNum += 1
        node.messenger.sendPrepare(prepareReq)
    }

    node.receivePromise = function (from, proposalId, lastValue) { // :: Int -> Int -> Int -> a ->
        if (proposalId != node.proposalId || (node.promises.indexOf(from) < 0)) {
            return
        }

        if (node.acceptors[from] == null) {
            var identReq = new Buffer(JSON.stringify({
                type: "identify",
                address: from
            }))
            node.messenger.sendToAcceptors(identReq)
            node.waiting.push(from)
            return
        }

        if (node.promises.indexOf(from) < 0) {
            node.promises.push(from)
        } else { return } // we have already received a promise. Something is probably wrong.

        if (lastAcceptedId > node.lastAcceptedId) {
            node.lastAcceptedId = last_acceptedId
            if (lastValue) { node.proposal = lastValue }
        }

        if (node.promises.length == node.quorom) {
            if (node.proposal) {
                node.messenger.sendAcceptRequest()
            }
        }
    }

    node.receiveAccept = function (from, proposalId, proposal) {
        // notify learners
        accepted = new Buffer(JSON.stringify({
            type: "accepted",
            proposalId: proposalId,
            value: proposal,
            from: from
        }))
        node.messenger.sendToLearners(accepted)
        node.prepare()

    }

    cluster.addNode(node)
    cluster.setQuorum()
}

function initializeAcceptor (node, cluster) { // :: Node -> Cluster ->
    node.roles.push('Acceptor')
    node.stateLog = {}
    // Sync stateLog with acceptors in cluster
    node.promisedId = null
    node.acceptedId = null
    node.lastAccepted = null
    node.learners = cluster.learners
    node.messenger.setMessageHandlers('Acceptor')

    node.receivePrepare = function (port, address, proposalId) {
        if (proposalID == node.promisedId) {
        } else if (proposalId > node.promisedId) {
            node.promisedId = proposalId
            node.messenger.sendPromise(port, address)
        }
    }

    node.receiveAcceptRequest = function (address, port, proposalId, proposal) { // :: Int -> Int -> a ->
        if (proposalId == node.promisedId) {
            node.promisedId = proposalId
            node.acceptedId = proposalId
            node.value = proposal
            // alert other nodes that a value is accepted
            // update state log.
        } else {
            node.messenger.sendNACK(from)
        }
    }

    cluster.addNode(node)
    cluster.setQuorum()
}

function initializeLearner (node, cluster) { // :: Node -> Cluster ->
    node.roles.push('Learner')
    node.finalValue = null
    node.stateLog = {}
    node.finalProposalId = null

    node.proposals = {} // proposal ID -> [accept count, retain count, value]

    node.receiveAccept = function (from, proposalId, acceptedValue) { // :: Int -> Int -> a ->
        if (node.finalValue != null) {
            return
        }

        var last = node.acceptors[from][1]
        if (last) {
            if (last > proposalId) { return }
            node.acceptors[from][1] = proposalId

            oldProposal = node.proposals[last]
            oldProposal[1] -= 1
            if (oldProposal[1] == 0) { delete node.proposals[last] }
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

exports.Messenger = Messenger
exports.Node = Node
exports.initializeProposer = initializeProposer
exports.initializeAcceptor = initializeAcceptor
exports.initializeLearner = initializeLearner
exports.Cluster = Cluster
