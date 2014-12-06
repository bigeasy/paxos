var consume = require('../consume')

function Network () {
    this.machines = []
}

Network.prototype.post = function (filter, route, index, envelopes) {
    var machine = this.machines.filter(function (machine) {
        return machine.legislator.id == route.path[index]
    }).shift()
    return machine.receive(filter, route, index, envelopes)
}

Network.prototype.tick = function (filter) {
    filter || (filter = function (envelope) { return [ envelope ] })
    var ticked
    while (this.machines.some(function (machine) { return machine.tick(filter) })) {
        ticked = true
    }
    return ticked
}

module.exports = Network
