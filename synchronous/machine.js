var assert = require('assert')
var consume = require('../consume')
var push = [].push

function Machine (network, legislator, logger) {
    this.network = network
    this.legislator = legislator
    this.logger = logger
}

Machine.prototype.receive = function (route, index, envelopes) {
    if (route.id != '-') {
        this.legislator.addRoute(route.id, route.path)
    }
    this.legislator.ingest(envelopes)
    while (this.legislator.consume(this.logger));
    var returns = [], parameters = []
    if (route.id != '-') {
        var cartridge = this.legislator.routed.hold(route.id, false)
        assert(cartridge, 'cartridge')
        assert(cartridge.value.path.every(function (value, index) {
            return value == route.path[index]
        }), 'routes do not match')
        cartridge.value.envelopes.forEach(function (envelope) {
            var i = route.path.indexOf(envelope.to)
            assert(i != -1, 'not in path')
            assert(i != index, 'not consumed')
            if (i < index) {
                returns.push(envelope)
            } else {
                parameters.push(envelope)
            }
        })
        cartridge.value.envelopes = []
        cartridge.release()
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

    while (this.legislator.consume(this.logger)) {
        ticked = true
    }

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
        this.legislator.consume(this.logger)
    }

    return ticked
}

module.exports = Machine
