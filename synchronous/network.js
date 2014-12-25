var consume = require('../consume')
var serializer = require('../serializer')
var transcript = require('../transcript')

function Network () {
    this.machines = []
}

Network.prototype.post = function (route, index, envelopes) {
    var serialized = transcript.serialize(serializer.flatten(envelopes))
    var machine = this.machines.filter(function (machine) {
        return machine.legislator.id == route.path[index]
    }).shift()
    return machine.receive(route, index, serialized)
}

Network.prototype.tick = function () {
    var ticked
    while (this.machines.some(function (machine) { return machine.tick() })) {
        ticked = true
    }
    return ticked
}

module.exports = Network
