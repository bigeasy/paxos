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
    var serialized = transcript.serialize(route, index, serializer.flatten(envelopes))
    var buffers = machine.receive(serialized)
    var deserialized = transcript.deserialize(buffers)
    var returns = serializer.expand(deserialized.messages)
    this.gremlins.forEach(function (gremlin) {
        if (gremlin('after', route, index, envelopes)) {
            returns = []
        }
    }, this)
    return returns
}

Network.prototype.schedule = function () {
    var scheduled = false
    this.machines.forEach(function (machine) {
        scheduled = machine.legislator.checkSchedule() || scheduled
    })
    return scheduled
}

Network.prototype.tick = function () {
    var ticked, looped = true
    while (looped) {
        looped = false
        this.machines.forEach(function (machine) {
            if (machine.tick()) {
                looped = true
                ticked = true
            }
        })
    }
    return ticked
}

module.exports = Network
