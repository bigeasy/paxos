var consume = require('../consume')
var serializer = require('../serializer')

function Network () {
    this.machines = []
}

Network.prototype.post = function (route, index, envelopes) {
    var flattened = serializer.flatten(envelopes)
    var machine = this.machines.filter(function (machine) {
        return machine.legislator.id == route.path[index]
    }).shift()
    return machine.receive(route, index, flattened)
}

Network.prototype.tick = function () {
    var ticked
    while (this.machines.some(function (machine) { return machine.tick() })) {
        ticked = true
    }
    return ticked
}

module.exports = Network
