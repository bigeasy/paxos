var consume = require('../consume')
var serializer = require('../serializer')
var transcript = require('../transcript')

function Network () {
    this.machines = []
    this.gremlins = []
    this.gremlinId = 0
}

Network.prototype.addGremlin = function (gremlin) {
    this.gremlins.push(gremlin)
    return gremlin
}

Network.prototype.removeGremlin = function (gremlin) {
    this.gremlins = this.gremlins.filter(function (f) {
        return f !== gremlin
    })
}

Network.prototype.post = function (route, index, envelopes) {
    this.gremlins.forEach(function (gremlin) {
        if (gremlin('before', route, index, envelopes)) {
            envelopes = []
        }
    }, this)
    var machine = this.machines.filter(function (machine) {
        return machine.legislator.id == route.path[index]
    }).shift()
    var serialized = transcript.serialize(serializer.flatten(envelopes))
    var buffers = machine.receive(route, index, serialized)
    var returns = serializer.expand(transcript.deserialize(buffers))
    this.gremlins.forEach(function (gremlin) {
        if (gremlin('after', route, index, envelopes)) {
            returns = []
        }
    }, this)
    return returns
}

Network.prototype.tick = function () {
    var ticked
    while (this.machines.some(function (machine) { return machine.tick() })) {
        ticked = true
    }
    return ticked
}

module.exports = Network
