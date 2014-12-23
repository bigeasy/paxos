var assert = require('assert')
var push = [].push

function Machine (network, legislator) {
    this.network = network
    this.legislator = legislator
}

Machine.prototype.receive = function (route, index, envelopes) {
    this.legislator.ingest(envelopes)

    var route = this.legislator.routeOf(route.path)

    // todo: post
    if (index < route.length) {
        throw new Error('post')
    }

    return this.legislator.returns(route.path, index)
}

Machine.prototype.tick = function () {
    var ticked = false

    var route = this.legislator.route() || this.legislator.unroute()

    if (route && route.path.length > 1) {
        var forwards = this.legislator.forwards(route.path, 0)
        if (forwards.length) {
            ticked = true
            this.legislator.ingest(this.network.post(route, 1, forwards))
        }
    }

    return ticked
}

module.exports = Machine
