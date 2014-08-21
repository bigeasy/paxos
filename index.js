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
    this.pendingMessage = null
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

    this.sendPending = function () {
        this.pendingMessage[1](this.pendingMessage[0])
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
        if (this.pendingMessage) { this.sendPending() }

        if (!Object.keys(this.node.acceptors).length) {
            this.pendingMessage = [message, this.sendToAcceptors]
            return
        }
        for (var acceptor in this.node.acceptors) {
            this.socket.send(message, 0, message.length, this.node.acceptors[acceptor][0][0], this.node.acceptors[acceptor][0][1])
        }
    }

    this.sendToLearners = function (message) {
        if (this.pendingMessage) { this.sendPending() }

        if (!Object.keys(this.node.learners).length) {
            this.pendingMessage = [message, this.sendToLearners]
            return
        }
        for (var learner in this.node.learners) {
            this.socket.send(message, 0, message.length, this.node.learners[learner][0], this.node.learners[learner][1])
        }
    }

    this.sendToProposers = function (message) {
        if (this.pendingMessage) { this.sendPending() }

        if (!Object.keys(this.node.proposers).length) {
            this.pendingMessage = [message, this.sendToProposers]
            return
        }
        for (var proposer in this.node.proposers) {
            this.socket.send(message, 0, message.length, this.node.proposers[proposer][0], this.node.proposers[proposer][1])
        }
    }

    this.notifyJoin = function (currentRound) {
        var message = this.createMessage({
            type: "join",
            port: this.address,
            address: this.port,
            role: this.node.roles[0],
            id: this.id,
            currentRound: currentRound
        })
        var nodes = this.node.acceptors.concat(this.node.proposers)
        for (var i = 0; i < nodes.length; i++) {
            this.socket.send(message, 0, message.length, nodes[i].port, nodes[i].address)
        }
    }

    this.sendInstance = function (instance, port, address) {
        // respond to joins with round info
        var message = this.createMessage({
            instance: instance,
            port: this.port,
            address: this.address
        })
        this.socket.send(message, 0, message.length, port, address)
    }

    this.setMessageHandlers = function (node, role) {
        this.socket.on("message", function (message, rinfo) {
            if (message.type == "join") {
                node.receiveJoin(message)
            }
        })
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
                    node.prepare(true, message.highestProposalNum)
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

function initializeFromFile (filepath, generateProposalId, callback) {
    var params = require(filepath)
    params.generateProposalId = generateProposalId
    var node = new Node(params)
    for (var role in params.roles) {
        if (role == 'Learner') initializeLearner(node)
        if (role == 'Proposer') initializeProposer(node)
        if (role == 'Acceptor') initializeAcceptor(node)
    }

    if (callback) {
      node.setCallback(callback)
    }
    return node
}

function Node (params) { // :: Int -> Int -> Int -> Socket -> (Int) -> Node
    // ID, address, port, generateProposalId, currentRound, nodes
    this.id = params.id
    this.address = params.address
    this.port = params.port
    this.proposal = null
    this.value = null
    this.lastValue = null
    this.lastRound = null
    this.roles = []
    this.quorum = null
    this.currentStatus = "idle"
    this.learners = []
    this.acceptors = []
    this.proposers = []
    this.generateProposalId = params.generateProposalId
    this.messenger = new Messenger(this, params.port, params.address)
    if (params.currentRound) {
        this.currentRound = params.currentRound
    } else {
        this.currentRound = 1
    }
    this.startInstance = function () {
        this.messenger.notifyJoin(currentRound)
    }

    this.receiveInstance = function (info) {
        if (info.currentRound > node.currentRound) {
            node.currentRound = info.currentRound
        }
    }

    this.end = function () {
        this.messenger.close()
        // should probably persist stateLog here
    }

    this.receiveJoin = function (info) {
        console.log("join")
        var instance = {}
        instance.lastValue = node.lastValue
        instance.currentStatus = node.currentStatus

        node.addNode({
            role: info.role,
            port: info.port,
            address: info.address
        })

        if (info.currentRound > node.currentRound) {
            node.currentRound = info.currentRound
        }
        instance.currentRound = node.currentRound

        node.messenger.sendInstance(instance, info.port, info.address)
    }

    this.addNode = function (node) {
        if (node.role == 'Learner') {
         this.learners.push([node.port, node.address])
        }
        if (node.role == 'Acceptor') {
            this.acceptors.push([node.port, node.address])
        }
        if (node.role == 'Proposer') {
            this.proposers.push([node.port, node.address])
        }
    }

    if (params.nodes) {
        params.nodes.forEach(function (node) {
          this.addNode(node)
        }, this)
    }

    this.setCallback = function (func) {
	this.callback = func
    }
}

function Cluster (nodes) { // :: [Node] -> Cluster
// for "non-networked" instances
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
    node.history = {}
    node.promises = []
    node.nextProposalNum = 1
    node.waiting = []
    node.messenger.setMessageHandlers(node, 'Proposer')
    node.leader = null


    node.startProposal = function (proposal, callback) {
        node.promises = []
        node.accepts = []
        node.proposal = proposal
        node.currentStatus = "proposal"
        if (callback) {
            node.callback = callback
        }

        if (node.leader) {
            node.messenger.sendAcceptRequest()
        } else {
            node.prepare(false)
        }
    }

    node.prepare = function (nack, seed) {
        node.proposalId = seed ? node.generateProposalId(seed) : node.generateProposalId()
        if (nack) {
            if (node.callback) {
                node.callback({
                    eventType: "NACK",
                    newProposalId: node.proposalId
                })
            }
        }
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
        if (node.accepts.indexOf(from) < 0) {
            node.accepts.push(from)
        }
        if (node.accepts.length >= node.quorum) {
            if (node.callback) {
                node.callback({
                    eventType: "accept",
                    proposal: proposal,
                    proposalId: proposalId,
                    leader: [node.address, node.port]
                })
            }

            node.messenger.sendToAcceptors(node.messenger.createMessage({
                type: "accepted",
                proposalId: proposalId,
                value: proposal,
                from: from
            }))
            node.leader = true
        }
    }

    node.receivePrevious = function (from, proposalId) {
        node.prepare(true, proposalId)
    }

    if (cluster) {
        cluster.addNode(node)
        cluster.setQuorum()
    } else {
        node.joinInstance()
    }
}

function initializeAcceptor (node, cluster) { // :: Node -> Cluster ->
    node.roles.push('Acceptor')
    node.stateLog = {}
    // Sync stateLog with acceptors in cluster
    node.promisedId = null
    node.acceptedId = null
    node.lastAccepted = null
    node.learners = cluster.learners
    node.leader = null
    node.messenger.setMessageHandlers(node, 'Acceptor')


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
        if (proposalId == node.promisedId || (address == node.leader[0] && port == node.leader[1])) {
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
            node.leader = [address, port]
            node.stateLog[Date.now()] = {
                round: node.currentRound,
                value: proposal,
                leader: node.leader,
                proposalId: proposalId
            }
            if (node.callback) {
                node.callback({
                    eventType: "accepted",
                    proposal: proposal,
                    proposalId: proposalId,
                    leader: node.leader
                })
            }
        } else if (proposalId < node.promisedId) {
            node.messenger.sendPrevious(port, address, proposalId, proposal)
        } else {
            node.messenger.sendNACK(address, port, node.promisedId)
        }
    }

    node.knownNode = function (from) {
        return (node.acceptors[from[0]][0] == from[1])
    }

    if (cluster) {
        cluster.addNode(node)
        cluster.setQuorum()
    } else {
        node.joinInstance()
    }
}

function initializeLearner (node, cluster, callback) { // :: Node -> Cluster ->
    node.roles.push('Learner')
    node.finalValue = null
    node.stateLog = {}
    node.finalProposalId = null
    if (callback) {
        node.callback = callback
    }

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
            if (node.callback) {
                node.callback({
                    eventType: "accepted",
                    proposal: acceptedValue,
                    proposalId: proposalId,
                    leader: from
                })
            }
        }
    }

    if (cluster) {
        cluster.addNode(node)
        cluster.setQuorum()
    } else {
        node.joinInstance()
    }
}


exports.Messenger = Messenger
exports.Node = Node
exports.initializeProposer = initializeProposer
exports.initializeAcceptor = initializeAcceptor
exports.initializeLearner = initializeLearner
exports.Cluster = Cluster
exports.initializeFromFile = initializeFromFile
