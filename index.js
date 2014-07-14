var dgram = require('dgram')

function Messenger (node, port, address) {
//object to deal with networking.
//will contain a dgram socket.
//each node will own one messenger object.
    this.node = node
    this.port = port
    this.address = address
    this.socket = dgram.createSocket("udp4")
    this.socket.bind(port, address)
    this.close = function () {
        this.socket.close()
    }
    this.createMessage = function (obj) {
        return new Buffer(JSON.stringify(obj))
    }
    this.sendAcceptRequest = function () {
        var acceptReq = this.createMessage({
            type: "accept",
            proposalId: this.node.proposalId,
            proposal: this.node.proposal,
            address: this.address,
            port: this.port
        })
        for (var acceptor in this.node.acceptors) {
            this.socket.send(acceptReq, 0, acceptReq.length, this.node.acceptors[acceptor][0][0], this.node.acceptors[acceptor][0][1])
        }
    }
    this.sendPromise = function (port, address) {
        var promise = this.createMessage({
            type: "promise",
            proposalId: this.node.promisedId,
            lastValue: this.node.lastAccepted,
            lastAcceptedId: this.node.lastAcceptedId,
            address: this.address,
            port: this.port,
            id: this.node.id
        })
        this.socket.send(promise, 0, promise.length, port, address)
    }
    this.sendPrepare = function () {
        var proposal = this.createMessage({
            type: "prepare",
            address: this.node.address,
            port: this.node.port,
            nodeId: this.node.id,
            proposalId: this.node.proposalId
        })
        this.sendToAcceptors(proposal)
    }
    this.sendNACK = function(address, port, promise) {
        var nack = this.createMessage({
            type: "NACK",
            address: this.address,
            port: this.port,
            highestProposalNum: promise
        })
        this.socket.send(nack, 0, nack.length, port, address)
    }
    this.sendIdentRequest = function(from) {
        var identReq = this.createMessage({
            type: "identify",
            nodeInfo: from,
            address: this.address,
            port: this.port
        })
        this.sendToAcceptors(identReq)
        node.waiting.push(from)
    }

    this.sendPrevious = function (port, address, proposalId, proposal) {
        var prevAccepted = this.createMessage({
            type: proposal ? "accepted" : "promised",
            address: this.address,
            port: this.port,
            proposalId: proposalId,
            proposal: proposal
        })
        this.socket.send(prevAccepted, 0, prevAccepted.length, port, address)
    }

    this.notifyProposers = function (proposers, messageType, info) {
        var message = this.createMessage({
            type: messageType,
            info: info
        })

        for (var proposer in proposers) {
            this.socket.send(message, 0, message.length, proposers[proposer][0], proposers[proposer][1])
        }
    }

    this.sendToAcceptors = function (message) {
        if (JSON.stringify(this.node.acceptors) == "{}") {
            this.node.pendingMessage = message
            return
        }
        for (var acceptor in this.node.acceptors) {
            this.socket.send(message, 0, message.length, this.node.acceptors[acceptor][0][0], this.node.acceptors[acceptor][0][1])
        }
    }
    this.sendToLearners = function (message) {
        for (var learner in this.node.learners) {
            this.socket.send(message, 0, message.length, this.node.learners[learner][0], this.node.learners[learner][1])
        }
    }
    this.send = function (message, address, port) {
        this.socket.send(message, 0, message.length, port, address)
    }

    this.setMessageHandlers = function (node, role) {
      if (role == "Proposer") {
        this.socket.on("message", function (message, rinfo) {
            message = JSON.parse(message.toString())
            if (message.type == "promise") {
                node.receivePromise(message.id, message.address, message.proposalId, message.lastValue, message.lastAcceptedId)
            } else if (message.type == "proposal") {
                node.setProposal(message.proposal)
            } else if (message.type == "accepted") {
                node.receiveAccept(message.from, message.proposalId, message.value)
            } else if (message.type == "known") {
                node.acceptors[message.nodeId] = [[message.nodePort, message.nodeAddress], null]
                var index = this.node.waiting.indexOf(message.nodeId)
                if (index > -1) {
                    node.promises.push(message.nodeId)
                    node.waiting.splice(index, 1)
                }
            } else if (message.type == "NACK") {
                node.proposalId = this.node.generateProposalId(message.highestProposalNum)
                node.nextProposalNum = this.node.proposalId + 1
                node.prepare()
            } else if (message.type == "new acceptor") {
                node.acceptors[message.nodeId] = [message.info, null]
            }
        })
      } else if (role == "Acceptor") {
        this.socket.on("message", function (message, rinfo) {
            message = JSON.parse(message.toString())
            if (message.type == "prepare") {
                node.receivePrepare(message.port, message.address, message.proposalId)
            } else if (message.type == "accept") {
                node.receiveAcceptRequest(message.address, message.port, message.proposalId, message.proposal)
            } else if (message.type == "identify") {
                if (node.knownNode(message.nodeInfo)) {
                    // send back 'known' if address belongs to known acceptor
                }
            }
        })
      } else if (role == "Learner") {
        this.socket.on("message", function (message, rinfo) {
            message = JSON.parse(message.toString())
            if (message.type == "accepted") {
                node.receiveAccept(message.from, message.proposalId, message.proposal)
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
        this.currentRound = currentRound
    } else {
        this.currentRound = 1
    }
    this.end = function () {
        this.messenger.close()
        // should probably persist stateLog here
    }
}

function Cluster (nodes) { // :: [Node] -> Cluster
    this.learners = {}
    this.acceptors = {}
    this.proposers = {}

    this.setQuorum = function () {
        if (this.acceptors.length % 2 == 0) {
            this.quorum = this.acceptors.length / 2 + 1
        } else {
            this.quorum = Math.ceil(Object.keys(this.acceptors).length / 2)
        }
        if (nodes) {
          for (var node in nodes) {
              node.quorum = this.quorum
          }
        }
    }

    this.addNode = function (node) {
        if (node.roles) {
            if (node.roles.indexOf('Learner') > -1) {
             this.learners[node.id] = [node.port, node.address]
            }
            if (node.roles.indexOf('Acceptor') > -1) {
                this.acceptors[node.id] = [node.port, node.address]
                node.messenger.notifyProposers(this.proposers, "new acceptor", {nodeId: node.id, info: this.acceptors[node.id]})
            }
            if (node.roles.indexOf('Proposer') > -1) {
                this.proposers[node.id] = [node.port, node.address]
            }
            for (var id in this.acceptors) {
                node.acceptors[id] = [this.acceptors[id], null]
            }
        }
    }
    if (nodes) {
        for (var node in nodes) {
            this.addNode(node)
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
    node.messenger.setMessageHandlers(node, 'Proposer')


    node.startProposal = function (proposal, callback) {
        node.promises = []
        node.proposal = proposal
        if (node.proposalId) {
            node.proposalId = node.generateProposalId(node.proposalId)
        } else {
          node.proposalId = node.generateProposalId()
        }
        if (callback) {
            node.callback = callback
        }
        node.prepare()
    }

    node.prepare = function () {
        node.nextProposalNum = node.proposalId + 1
        node.messenger.sendPrepare()
    }

    node.receivePromise = function (fromId, fromAddress, proposalId, lastValue, lastAcceptedId) { // :: Int -> Int -> Int -> a ->
        if (proposalId != node.proposalId) {
            return
        }

        if (node.acceptors[fromId] == null) {
            node.messenger.sendIdentRequest([fromId, fromAddress])
            return
        }

        if (node.promises.indexOf(fromId) < 0) {
            node.promises.push(fromId)
        } else { return } // we have already received a promise. Something is probably wrong.

        if (lastAcceptedId > node.lastAcceptedId) {
            node.lastAcceptedId = lastAcceptedId
            if (lastValue) { node.proposal = lastValue }
        }

        if (node.promises.length >= node.quorum) {
            if (node.proposal) {
                node.messenger.sendAcceptRequest()
            }
        }
    }

    node.receiveAccept = function (from, proposalId, proposal) {
        if (node.callback) {
            console.log('reached callback')
            node.callback(proposal)
        }
        node.messenger.sendToLearners(node.messenger.createMessage({
            type: "accepted",
            proposalId: proposalId,
            value: proposal,
            from: from
        }))
    }

    node.receivePrevious = function (from, proposalId) {
    }

    if (cluster) {
      cluster.addNode(node)
      cluster.setQuorum()
    }
}

function initializeAcceptor (node, cluster, callback) { // :: Node -> Cluster ->
    node.roles.push('Acceptor')
    node.stateLog = {}
    // Sync stateLog with acceptors in cluster
    node.promisedId = null
    node.acceptedId = null
    node.lastAccepted = null
    node.learners = cluster.learners
    node.messenger.setMessageHandlers(node, 'Acceptor')
    if (callback) { node.callback = callback }

    node.receivePrepare = function (port, address, proposalId) {
        if (proposalId == node.promisedId) {
            return
        } else if (proposalId > node.promisedId) {
            node.promisedId = proposalId
            node.messenger.sendPromise(port, address)
        } else {
            node.messenger.sendPrevious(port, address, proposalId)
        }
    }

    node.receiveAcceptRequest = function (address, port, proposalId, proposal) { // :: Int -> Int -> a ->
        console.log('accepted')
        if (proposalId == node.promisedId) {
            node.promisedId = proposalId
            node.acceptedId = proposalId
            node.value = proposal
            var message = node.messenger.createMessage({
                type: "accepted",
                value: proposal,
                address: address,
                port: port,
                proposalId: proposalId
            })
            node.messenger.sendToAcceptors(message)
            node.messenger.sendToLearners(message)
            node.messenger.send(message, address, port)
            node.stateLog[Date.now()] = {round: node.currentRound, value: proposal, leader: {address: address, port: port}}
            if (node.callback) {
                node.callback()
            }
        } else if (proposalId < node.promisedId) {
            node.messenger.sendPrevious(port, address, proposalId, proposal)
        } else {
            node.messenger.sendNACK(address, port, node.promisedId)
        }
    }

    node.knownNode = function (info) {
        return (node.acceptors[from[0]][0] == from[1])
    }

    if (cluster) {
      cluster.addNode(node)
      cluster.setQuorum()
    }
}

function initializeLearner (node, cluster, callback) { // :: Node -> Cluster ->
    node.roles.push('Learner')
    node.finalValue = null
    node.stateLog = {}
    node.finalProposalId = null
    if (callback) { node.callback = callback }

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
            console.log(node.finalValue)
        }
    }
    if (cluster) {
      cluster.addNode(node)
      cluster.setQuorum()
    }
}

exports.Messenger = Messenger
exports.Node = Node
exports.initializeProposer = initializeProposer
exports.initializeAcceptor = initializeAcceptor
exports.initializeLearner = initializeLearner
exports.Cluster = Cluster
