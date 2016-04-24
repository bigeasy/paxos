var assert = require('assert')

function Transmission (network, pulse) {
    this.network = network
    this.pulse = pulse
    this.direction = 'ascending'
    this.index = 0
    this.success = true
}

Transmission.prototype.consume = function (now) {
    var index = +(this.pulse.route[this.index])
    this.pulse = JSON.parse(JSON.stringify(this.pulse))
    if (this.direction == 'descending') {
        this.network[index].sent(now, this.pulse, this.success)
    }
    this.network[index].consume(now, this.pulse, this.direction)
    if (this.direction == 'ascending') {
        if (this.index == this.pulse.route.length - 1) {
            this.direction = 'descending'
        } else {
            this.index++
        }
    } else if (this.index == 0) {
        return false
    } else {
        this.index--
    }
    return true
}

exports.transmit = function (now, network, index) {
    assert(arguments.length == 3, 'now')
    return network[index].outbox(now).map(function (pulse) {
        return new Transmission(network, pulse)
    })
}

exports.tick = function (now, network) {
    var ticked = true
    TICK: while (ticked) {
        ticked = false
        for (var i = 0, I = network.length; i < I; i++) {
            var transmissions = exports.transmit(now, network, i)
            if (transmissions.length) {
                ticked = true
                while (transmissions.length) {
                    var transmission = transmissions.shift()
                    while (transmission.consume(now));
                }
                continue TICK
            }
        }
    }
}
