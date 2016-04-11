var assert = require('assert')
var push = [].push

function Machine (network, legislator) {
    this.network = network
    this.legislator = legislator
}

Machine.prototype.receive = function (now, route, index, envelopes) {
    this.legislator.inbox(now, route, envelopes)

    var route = this.legislator.routeOf(now, route.path, route.pulse)

    if (index + 1 < route.path.length) {
        var forwards = this.legislator.forwards(now, route, index)
        this.legislator.inbox(now, route, this.network.post(now, route, index + 1, forwards))
    }

    return this.legislator.returns(now, route, index)
}

Machine.prototype.tick = function (now) {
    var ticked = false

    this.legislator.outbox(now).forEach(function (route) {
        var forwards = this.legislator.forwards(now, route, 0)
        assert(forwards.length, 'no forwards')
        var returns = this.network.post(now, route, 1, forwards)
        this.legislator.inbox(now, route, returns)
        this.legislator.sent(now, route, forwards, returns)
        ticked = true
    }, this)

    return ticked
}

module.exports = Machine
