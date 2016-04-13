var assert = require('assert')
var push = [].push

function Machine (network, legislator) {
    this.network = network
    this.legislator = legislator
}

Machine.prototype.receive = function (now, pulse, index) {
    this.legislator.consume(now, pulse)
    if (index + 1 < pulse.route.length) {
        pulse = this.network.post(now, pulse, index + 1)
        this.legislator.consume(now, pulse)
    }
    return pulse
}

Machine.prototype.tick = function (now) {
    var ticked = false

    var pulse = this.legislator.outbox.shift()
    if (pulse) {
        this.legislator.consume(now, pulse)
        if (pulse.route.length > 1) {
            pulse = this.network.post(now, pulse, 1)
            this.legislator.consume(now, pulse)
        }
        this.legislator.sent(now, pulse, true)
        ticked = true
    }

    return ticked
}

module.exports = Machine
