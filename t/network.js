var Paxos = require('..')

function Network () {
    this.denizens = []
    this.failures = []
    this.time = 0
}

Network.prototype.receive = function (denizen, request) {
    var responses = {}
    request.to.forEach(function (id) {
        var denizen = this.denizens[id]
        if (this.failures[id] != 'request' && this.failures[id] != 'isolate') {
            responses[id] = this.denizens[id].request(this.time, request)
        }
        if (this.failures[id] == 'response' || this.failures[denizen.id] == 'isolate') {
            responses[id] = null
        }
    }, this)
    denizen.response(this.time, request, responses)
}

Network.prototype._send = function (denizen) {
    var sent = false, message
    while (denizen.shifter.peek()) {
        this.receive(denizen, denizen.shifter.shift())
        sent = true
    }
    return sent
}

Network.prototype.send = function () {
    var vargs = Array.prototype.slice.call(arguments)
    var count = typeof vargs[0] == 'number' ? vargs.shift() : Infinity
    var denizens = vargs.length == 0
                 ? this.denizens
                 : vargs.shift().map(function (id) { return this.denizens[id] }.bind(this))
    var ticked = true
    while (ticked && count--) {
        ticked = false
        for (var i = 0, denizen; (denizen = denizens[i]) != null; i++) {
            if (this.failures[denizen.id] != 'isolate') {
                denizen.scheduler.check(this.time)
                while (this._send(denizen)) {
                    ticked = true
                }
            }
        }
    }
}

Network.prototype.timeAndTick = function (count) {
    while (count-- != 0) {
        this.time++
        this.tick()
    }
}

Network.prototype.push = function () {
    var id = String(this.denizens.length)
    var denizen = new Paxos(this.time, 1, id, {
        parliamentSize: 5,
        ping: 1,
        timeout: 3,
        naturalized: true
    })
    denizen.scheduler.events.shifter().pump(denizen.event.bind(denizen))
    denizen.shifter = denizen.outbox2.shifter()
    this.denizens.push(denizen)
}

Network.prototype.populate = function (count) {
    while (count-- != 0) {
        this.push()
        if (this.denizens.length == 1) {
            this.denizens[0].bootstrap(this.time, { location: '0' })
        } else {
            var denizen = this.denizens[this.denizens.length - 1]
            this.denizens[0].immigrate(this.time, 1, denizen.id, denizen.cookie, { location: denizen.id })
        }
    }
}

Network.prototype.isolate = function (id) {
    this.failures[id] = 'isolate'
}

module.exports = Network
