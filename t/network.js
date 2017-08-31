var Paxos = require('..')

function subSubset (container, contained) {
    if (typeof conatined != 'object') {
        return container === contained
    } else if (Array.isArray(contained)) {
        if (!Array.isArray(container)) {
            return false
        }
        if (contained.length > container.length) {
            return false
        }
        for (var i = 0, j = 0, I = container.length, J = contained.length; i < I && j < J; i++) {
            if (subSubset(container[i], contained[j])) {
                j++
            }
        }
        return j == contained.length
    } else if (typeof container == 'object' && !Array.isArray(container)) {
        return subset(container, contained)
    }
    return false
}

function subset (container, contained) {
    for (var key in contained) {
        if (!(key in container) || !subSubset(container[key], contained[key])) {
            return false
        }
    }
    return true
}

function Network () {
    this.denizens = []
    this.failures = []
    this.time = 0
}

Network.prototype.receive = function (denizen, request) {
    var responses = {}
    request.to.forEach(function (id) {
        var denizen = this.denizens[id]
        if (this.failures[id] != 'isolate') {
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
    if (Object.keys(envelope.responses).length == envelope.request.message.to.length) {
        this.denizens[envelope.from].response(this.time, envelope.request, envelope.responses)
    }
}

function getFailure (failure, request) {
    switch (typeof failure) {
    case 'string':
        return failure
    case 'function':
        return failure(request)
    default:
        return 'none'
    }
}

Network.prototype.fail = function (intercepted) {
    for (var name in intercepted) {
        while (intercepted[name].length != 0) {
            var envelope = intercepted[name].shift()
            envelope.responses[envelope.to] = null
            this.response(envelope)
        }
    }
}

Network.prototype.intercept = function () {
    var vargs = Array.prototype.slice.call(arguments)
    var count = typeof vargs[0] == 'number' ? vargs.shift() : Infinity
    var denizens = []
    while (typeof vargs[0] == 'string') {
        denizens.push(vargs.shift())
    }
    var messages = vargs.shift()
    var matches = [], intercepted = {}
    for (var name in messages) {
        intercepted[name] = []
        var interception = Array.isArray(messages[name]) ? messages[name].slice() : [ messages[name] ]
        matches.push({
            count: interception[0] == 'number' ? interception.shift() : 1,
            subsets: interception
        })
    }
    var sent = true
    while (sent && count--) {
        sent = false
        for (var i = 0, denizen; (denizen = this.denizens[i]) != null; i++) {
            if (denizens.length != 0 && !~denizens.indexOf(denizen.id)) {
                continue
            }
            denizen.scheduler.check(this.time)
            var request
            while ((request = denizen.shifter.shift()) != null) {
                sent = true
                var responses = {}
                for (var j = 0, to; (to = request.message.to[j]) != null; j++) {
                    var envelope = {
                        to: to,
                        from: denizen.id,
                        request: request,
                        responses: responses
                    }
                    MATCH: for (var k = 0, match; (match = matches[k]) != null; k++) {
                        for (var l = 0, L = match.subsets.length; l < L; l++) {
                            if (subset(envelope, match.subsets[l])) {
                                match.count = Math.max(0, match.count - 1)
                                if (match.count == 0) {
                                    intercepted[name].push(envelope)
                                    break MATCH
                                }
                            }
                        }
                    }
                    if (k == matches.length) {
                        this.request(envelope)
                    }
                }
                this.response(envelope)
            }
        }
    }
    return intercepted
}

Network.prototype.send2 = function () {
    var vargs = Array.prototype.slice.call(arguments)
    var count = typeof vargs[0] == 'number' ? vargs.shift() : Infinity
    var sent = true
    while (sent && count--) {
        var requests = this.getRequests.apply(this, vargs)
        sent = false
        for (var id in requests) {
            while (requests[id].length) {
                sent = true
                var request = requests[id].shift()
                switch (getFailure(this.failures[request.to])) {
                case 'skip':
                    break
                case 'response':
                    this.request(request)
                case 'isolate':
                    request.responses[request.to] = null
                    this.response(request)
                    break
                case 'none':
                    this.request(request)
                    this.response(request)
                    break
                }
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
    var vargs = Array.prototype.slice.call(arguments)
    if ((typeof (vargs[0] || '')) != 'object') {
        vargs.unshift({})
    }
    var response = vargs.shift()
    if (vargs.filter(function (id) { return /^\d+$/.test(id) }).length == 0) {
        vargs.push.apply(vargs, Object.keys(this.denizens))
    }
    if (vargs.filter(function (id) { return ! /^\d+$/.test(id) }).length == 0) {
        vargs.push('events', 'outbox')
    }
    var requests = Array.isArray(response) ? {} : response
    vargs.filter(function (id) {
        return this.denizens[id]
    }.bind(this)).map(function (id) {
        return this.denizens[id]
    }.bind(this)).forEach(function (denizen) {
        if (~vargs.indexOf('events')) {
            denizen.scheduler.check(this.time)
        }
        var request
        requests[denizen.id] = Array.isArray(response) ? response : []
        if (~vargs.indexOf('outbox')) {
            while ((request = denizen.shifter.shift()) != null) {
                var responses = {}
                request.message.to.forEach(function (to) {
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
    return response
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
