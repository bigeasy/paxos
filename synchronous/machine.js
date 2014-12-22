var assert = require('assert')
var push = [].push

function Machine (network, legislator) {
    this.network = network
    this.legislator = legislator
}

Machine.prototype.receive = function (route, index, envelopes) {
    this.legislator.ingest(envelopes)
    var returns = [], parameters = []
    if (route.id != '-') {
        var route = this.legislator.routeOf(route.id)
        route.envelopes.forEach(function (envelope) {
            var i = route.path.indexOf(envelope.to)
            assert(i != -1, 'not in path')
            assert(i != index, 'not consumed')
            if (i < index) {
                returns.push(envelope)
            } else {
                parameters.push(envelope)
            }
        })
        route.envelopes = []
    }
    // todo: post
    if (index < route.length) {
        throw new Error('post')
    }
    route.path.slice(0, index).forEach(function (id) {
        var unrouted = this.legislator.unrouted[route.path[0]] || []
        delete this.legislator.unrouted[route.path[0]]
        push.apply(returns, unrouted)
    }, this)
    return returns
}

Machine.prototype.tick = function () {
    var route, envelopes, ticked

    route = this.legislator.route()
    if (route) {
        ticked = true
        envelopes = route.envelopes
    }

    if (!route) {
        route = this.legislator.unroute()
        envelopes = []
    }

    if (route && route.path.length > 1) {
        ticked = true
        route.path.slice(1).forEach(function (id) {
            push.apply(envelopes, this.legislator.unrouted[id] || [])
            delete this.legislator.unrouted[id]
        }, this)
        this.legislator.ingest(this.network.post(route, 1, envelopes))
    }

    return ticked
}

module.exports = Machine
