function Transmission (network, pulse) {
    this.network = network
    this.pulse = pulse
    this.direction = 'ascending'
    this.index = 0
    this.success = true
}

Transmission.prototype.consume = function (now) {
    var index = +(this.pulse.route[this.index])
    if (this.direction == 'decending') {
        this.network[index].sent(now, this.pulse, this.success)
    }
    this.network[index].consume(now, this.pulse)
    if (this.direction == 'ascending') {
        if (this.index == this.pulse.route.length - 1) {
            this.direction = 'decending'
            if (index > 0) {
                this.index--
            }
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

exports.transmit = function (network, index) {
    var pulse = network[index].outbox()
    if (pulse) {
        return new Transmission(network, pulse)
    }
    return null
}

exports.tick = function (now, network) {
    var ticked = true
    TICK: while (ticked) {
        ticked = false
        for (var i = 0, I = network.length; i < I; i++) {
            var transmission = exports.transmit(network, i)
            if (transmission) {
                ticked = true
                while (transmission.consume(now));
                continue TICK
            }
        }
    }
}
