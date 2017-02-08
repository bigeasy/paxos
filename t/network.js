var Paxos = require('..')

function Network () {
    this.denizens = []
    this.failures = []
    this.time = 0
}

Network.prototype.receive = function (denizen, send) {
    var responses = {}
    send.route.forEach(function (id) {
        var denizen = this.denizens[id]
        if (this.failures[id] != 'request' && this.failures[id] != 'isolate') {
            responses[id] = denizen.receive(this.time, send, send.messages)
        }
        if (responses[id] == 'response') {
            delete responses[id]
        }
    }, this)
    denizen.sent(this.time, send, responses)
}

Network.prototype.send = function (denizen) {
    var sent = false, message
    while (denizen.shifter.peek()) {
        this.receive(denizen, denizen.shifter.shift())
        sent = true
    }
    return sent
}

Network.prototype.tick = function () {
    var ticked = true
    while (ticked) {
        ticked = false
        this.denizens.forEach(function (denizen) {
            if (this.failures[denizen.id] != 'isolate') {
                denizen.scheduler.check(this.time)
                while (this.send(denizen)) {
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

Network.prototype.addDenizens = function (count) {
    while (count-- != 0) {
        var id = String(this.denizens.length)
        var denizen = new Paxos(id, {
            parliamentSize: 5,
            ping: 1,
            timeout: 3,
            naturalized: true,
            shifter: true,
            scheduler: { timerless: true }
        })
        this.denizens.push(denizen)
        if (this.denizens.length == 1) {
            this.denizens[0].bootstrap(this.time, 1, { location: '0' })
        } else {
            denizen.join(this.time, 1)
            this.denizens[0].immigrate(this.time, 1, id, denizen.cookie, { location: id })
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
