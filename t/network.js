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

Network.prototype.request = function (envelope) {
    envelope.responses[envelope.to] = this.denizens[envelope.to].request(this.time, envelope.request)
}

Network.prototype.response = function (envelope) {
    if (Object.keys(envelope.responses).length == envelope.to.length) {
        this.denizens[envelope.from].response(this.time, envelope.request, envelope.responses)
    }
}

Network.prototype.send2 = function () {
    var sent = true
    while (sent) {
        var requests = this.getRequests()
        sent = false
        for (var id in requests) {
            while (requests[id].length) {
                sent = true
                var request = requests[id].shift()
                this.request(request)
                this.response(request)
            }
        }
    }
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

Network.prototype.getRequests = function () {
    var vargs = Array.prototype.slice(arguments)
    if (vargs.filter(function (id) { return /^\d+$/.test(id) }).length == 0) {
        vargs.push.apply(vargs, Object.keys(this.denizens))
    }
    if (vargs.filter(function (id) { return ! /^\d+$/.test(id) }).length == 0) {
        vargs.push('events', 'outbox')
    }
    var requests = {}
    vargs.filter(function (id) {
        return this.denizens[id]
    }.bind(this)).map(function (id) {
        return this.denizens[id]
    }.bind(this)).forEach(function (denizen) {
        if (~vargs.indexOf('events')) {
            denizen.scheduler.check(this.time)
        }
        var request
        requests[denizen.id] = []
        if (~vargs.indexOf('outbox')) {
            while ((request = denizen.shifter.shift()) != null) {
                var responses = {}
                request.to.forEach(function (to) {
                    requests[denizen.id].push({
                        request: request,
                        to: to,
                        from: denizen.id,
                        responses: responses
                    })
                })
            }
        }
    }.bind(this))
    return requests
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
    denizen.shifter = denizen.outbox.shifter()
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
