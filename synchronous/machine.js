var assert = require('assert')
var push = [].push
var serializer = require('../serializer')
var transcript = require('../transcript')

function Machine (network, legislator) {
    this.network = network
    this.legislator = legislator
}

Machine.prototype.receive = function (now, buffers) {
    var work = transcript.deserialize(buffers)
    var route = work.route, index = work.index, expanded = serializer.expand(work.messages)
    this.legislator.inbox(now, route, expanded)

    var route = this.legislator.routeOf(route.path, route.pulse)

    if (index + 1 < route.path.length) {
        var forwards = this.legislator.forwards(route, index)
        this.legislator.inbox(now, route, this.network.post(now, route, index + 1, forwards))
    }

    var returns = this.legislator.returns(route, index)
    return transcript.serialize(work.route, work.index, serializer.flatten(returns))
}

Machine.prototype.tick = function (now) {
    var ticked = false

    this.legislator.outbox().forEach(function (route) {
        var forwards = this.legislator.forwards(route, 0)
        assert(forwards.length, 'no forwards')
        var returns = this.network.post(now, route, 1, forwards)
        this.legislator.inbox(now, route, returns)
        this.legislator.sent(now, route, forwards, returns)
        ticked = true
    }, this)

    return ticked
}

module.exports = Machine
