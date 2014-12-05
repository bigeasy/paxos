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

Network.prototype.tick = function (filter) {
    filter || (filter = function () {})
    var ticked
    while (this.machines.some(function (machine) { return machine.tick(filter) })) {
        ticked = true
    }
    return ticked
}

module.exports = Network
