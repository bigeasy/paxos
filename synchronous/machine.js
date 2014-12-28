var assert = require('assert')
var push = [].push
var serializer = require('../serializer')
var transcript = require('../transcript')

function Machine (network, legislator) {
    this.network = network
    this.legislator = legislator
}

Machine.prototype.receive = function (route, index, buffers) {
    var expanded = serializer.expand(transcript.deserialize(buffers))
    this.legislator.inbox(expanded)

    var route = this.legislator.routeOf(route.path)

    if (index + 1 < route.path.length) {
        var forwards = this.legislator.forwards(route.path, index)
        this.legislator.inbox(this.network.post(route, index + 1, forwards))
    }

    var returns = this.legislator.returns(route.path, index)
    return transcript.serialize(serializer.flatten(returns))
}

Machine.prototype.tick = function () {
    var ticked = false

    this.legislator.outbox().forEach(function (route) {
        var forwards = this.legislator.forwards(route.path, 0)
        assert(forwards.length, 'no forwards')
        var returns = this.network.post(route, 1, forwards)
        this.legislator.inbox(returns)
        this.legislator.sent(route, forwards, returns)
        ticked = true
    }, this)

    return ticked
}

module.exports = Machine
