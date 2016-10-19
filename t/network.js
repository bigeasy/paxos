var Legislator = require('../legislator')

function Network () {
    this.legislators = []
    this.failures = []
    this.time = 0
    this.options = {
        parliamentSize: 5,
        ping: 1,
        timeout: 3,
        naturalized: true,
        scheduler: { timerless: true }
    }
}

Network.prototype.receive = function (legislator, outbox) {
    if (outbox.length == 0) {
        return false
    }
    var send = outbox.shift(), responses = {}
    send.route.forEach(function (id) {
        var legislator = this.legislators[id]
        if (this.failures[id] != 'request' && this.failures[id] != 'isolate') {
            responses[id] = legislator.receive(this.time, send, send.messages)
        }
        if (this.failures[id] == 'response') {
            delete responses[id]
        }
    }, this)
    legislator.sent(this.time, send, responses)
    return true
}

Network.prototype.send = function (legislator) {
    var sent = false
    var outbox = legislator.synchronize(this.time)
    if (outbox.length == 0) {
        var consensus = legislator.consensus(this.time)
        if (consensus) {
            outbox = [ consensus ]
        }
    }
    while (this.receive(legislator, outbox)) {
        sent = true
    }
    return sent
}

Network.prototype.tick = function () {
    var ticked = true
    while (ticked) {
        ticked = false
        this.legislators.forEach(function (legislator) {
            if (this.failures[legislator.id] != 'isolate') {
                legislator.scheduler.check(this.time)
                while (this.send(legislator)) {
                    ticked = true
                }
            }
        }, this)
    }
}

Network.prototype.timeAndTick = function (count) {
    while (count-- != 0) {
        this.time++
        this.tick()
    }
}

Network.prototype.addLegislators = function (count) {
    while (count-- != 0) {
        var id = String(this.legislators.length)
        var legislator = new Legislator(1, id, this.time, this.options)
        this.legislators.push(legislator)
        if (this.legislators.length == 1) {
            this.legislators[0].bootstrap(this.time, 1, { location: '0' })
        } else {
            this.legislators[0].immigrate(this.time, 1, id, legislator.cookie, { location: id })
            this.tick()
        }
    }
    this.time++
    this.tick()
    this.time++
    this.tick()
}

Network.prototype.isolate = function (id) {
    this.failures[id] = 'isolate'
}

module.exports = Network
