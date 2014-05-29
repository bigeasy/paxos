var dgram = require('dgram')

function Node (id, address, port, socket, generateProposalId) { // :: Int -> Int -> Int -> Socket -> (Int) -> Node
    this.socket = socket
    this.id = id
    this.address = address
    this.port = port
    this.acceptors = {} // ID -> [[port, address], last proposal]
    this.proposal = null
    this.value = null
    this.roles = []
    this.quorum = null
    this.generateProposalId = generateProposalId
    this.sendToAcceptors = function (message) {
        for (var acceptor in this.acceptors) {
            this.socket.send(message, 0, this.acceptors[acceptor][0][0], this.acceptors[acceptors][0][1])
        }
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
        nodes.ForEach(function (node, _, _) {
            node.quorum = this.quorum
        }, this)()
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

    node.socket.on("message", function (message, rinfo) {
        message = JSON.parse(message.toString())
        if (message.type == "promise") {
            node.receivePromise(message.id, message.proposalId, message.lastAcceptedId, message.lastValue)
        } else if (message.type == "proposal") {
            node.setProposal(message.proposal)
        } else if (message.type == "NAK") {
            node.prepare()
        } else if (message.type == "accepted") {
            node.recieveAccept()
        } else if (message.type == "known") {
            node.acceptors[message.nodeId] = [[message.nodePort, message.nodeAddress], message.nodeLastProposal]
            var index = node.waiting.indexOf(message.nodeId)
            if (index > -1) {
                node.promises.push(message.nodeId)
                node.waiting.splice(index, 1)
            }
        }
    })
    node.socket.bind(node.port, node.address)
    // (create and bind socket outside?

    node.setProposal = function (proposal, proposalId) {
        node.proposal = proposal
        node.proposalId = node.generateProposalId()
    }

    node.sendPrepare = function () {
        var proposal = new Buffer(JSON.stringify({
            type: "prepare",
            address: node.address,
            port: node.port,
            nodeId: node.id,
            proposalId: node.proposalId
        }))
        node.sendToAcceptors(proposal)
    }

    node.prepare = function () {
        node.promises = []
        node.nextProposalNum += 1
    }

    node.receivePromise = function (from, proposalId, lastAcceptedId, lastValue) { // :: Int -> Int -> Int -> a ->
        if (proposalId != node.proposalId || (node.promises.indexOf(from) < 0)) {
            return
        }

        if (node.acceptors[from] == null) {
            var identReq = new Buffer(JSON.stringify({
                type: "identify",
                address: from
            }))
            node.sendToAcceptors(identReq)
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
                acceptReq = new Buffer(JSON.stringify({
                    type: "accept",
                    proposalId: node.proposalId,
                    proposal: node.proposal,
                }))
                for (var acceptor in node.acceptors) {
                    node.socket.send(acceptReq, 0, node.acceptors[acceptor][0][0], node.acceptors[acceptor][0][1])
                }
            }
        }
    }

    node.receiveAccept = function (from, proposalId, proposal) {
        // notify learners
    } //TODO

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

    node.socket.on("message", function (message, rinfo) {
    // message types: prepare, accept
        if (message.type == "prepare") {
            node.receivePrepare(message.port, message.address, message.proposalId)
        } else if (message.type == "accept") {
            node.receiveAcceptRequest(message.proposalId, message.proposal)
        } else if (message.type == "identify") {
            // send back 'known' if address belongs to known acceptor
        }
    })

    node.receivePrepare = function (port, address, proposalId) {
        if (proposalID == node.promisedId) {
        } else if (proposalId > node.promisedId) {
            node.promisedId = proposalId
            node.sendPromise(port, address)
        }
    }

    node.receiveAcceptRequest = function (proposalId, proposal) { // :: Int -> Int -> a ->
        if (proposalId == node.promisedId) {
            node.promisedId = proposalId
            node.acceptedId = proposalId
            node.value = proposal
            // alert other nodes that a value is accepted
            // update state log.
        }
    }

    node.sendPromise = function (port, address) {
        var promise = new Buffer(JSON.stringify({
            type: "promise",
            proposalId: node.promisedId,
            lastValue: node.lastAccepted
        }))
        node.socket.send(promise, 0, port, address)
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
