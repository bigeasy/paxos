var assert = require('assert')
var consume = require('../consume')

function Machine (network, legislator, logger) {
    this.network = network
    this.legislator = legislator
    this.logger = logger
}

Machine.prototype.receive = function (route, index, envelopes) {
    this.legislator.ingest(envelopes)
    this.legislator.consume(this.logger)
    consume(this.legislator.routed, function (envelope) {
        if (route.id == envelope.route) {
            throw new Error
        }
    })
    // todo: post
    if (index < route.length) {
        throw new Error('post')
    }
    var returns = this.legislator.unrouted[route.path[0]]
    delete this.legislator.unrouted[route.path[0]]
    return returns
}

Machine.prototype.tick = function () {
    while (this.legislator.consume(this.logger));

    var purge = this.legislator.routed.purge()
    while (purge.cartridge) {
        if (purge.cartridge.value.envelopes.length == 0) {
            purge.cartridge.remove()
        } else if (purge.cartridge.value.path[0] == this.legislator.id) {
            console.log(purge.cartridge.value.envelopes)
            throw new Error
        } else {
            purge.cartridge.release()
        }
        purge.next()
    }
    purge.release()

    var unrouted = Object.keys(this.legislator.unrouted)
    if (unrouted.length) {
        var envelope = this.legislator.unrouted[unrouted[0]][0]
        assert(envelope.from == this.legislator.id, 'not from current legislator')
        var route = {
            id: '-',
            path: [ envelope.from, envelope.to ]
        }
    }

    if (route) {
        var envelopes = []
        if (route.id != '-') {
        }
        consume(this.legislator.unrouted[route.path[1]], function (envelope) {
            if (route.path.indexOf(envelope.to) > 0) {
                envelopes.push(envelope)
                return true
            }
        })
        this.legislator.ingest(this.network.post(route, 1, envelopes))
        this.legislator.consume(this.logger)
    }
}

module.exports = Machine
