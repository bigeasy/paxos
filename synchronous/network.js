var consume = require('../consume')

function Network () {
    this.machines = []
}

Network.prototype.post = function (route, index, envelopes) {
    var machine = this.machines.filter(function (machine) {
        return machine.legislator.id == route.path[index]
    }).shift()
    return machine.receive(route, index, envelopes)
}

Network.prototype.tick = function () {
    var ticked
    while (this.machines.some(function (machine) { return machine.tick() })) {
        ticked = true
    }
    return ticked
}

module.exports = Network
