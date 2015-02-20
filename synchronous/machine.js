var assert = require('assert')
var push = [].push
var serializer = require('../serializer')
var transcript = require('../transcript')

function Machine (network, legislator) {
    this.network = network
    this.legislator = legislator
}

Machine.prototype.receive = function (buffers) {
    var work = transcript.deserialize(buffers)
    var route = work.route, index = work.index, expanded = serializer.expand(work.messages)
    this.legislator.inbox(route, expanded)

    var route = this.legislator.routeOf(route.path, route.pulse)

    if (index + 1 < route.path.length) {
        var forwards = this.legislator.forwards(route, index)
        this.legislator.inbox(route, this.network.post(route, index + 1, forwards))
    }

    var returns = this.legislator.returns(route, index)
    return transcript.serialize(work.route, work.index, serializer.flatten(returns))
}

Machine.prototype.tick = function () {
    var ticked = false

    this.legislator.outbox().forEach(function (route) {
        var forwards = this.legislator.forwards(route, 0)
        assert(forwards.length, 'no forwards')
        var returns = this.network.post(route, 1, forwards)
        this.legislator.inbox(route, returns)
        this.legislator.sent(route, forwards, returns)
        ticked = true
    }, this)

    return ticked
}

module.exports = Machine
