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

module.exports = Network
