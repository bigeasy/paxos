var Paxos = require('..')
var coalesce = require('extant')

function subSubset (container, contained) {
    if (typeof contained != 'object') {
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

Network.prototype.request = function (envelope) {
    envelope.responses[envelope.request.to] = this.denizens[envelope.request.to].request(this.time, envelope.request)
}

Network.prototype.response = function (envelope) {
    if (Object.keys(envelope.responses).length == envelope.request.message.to.length) {
        this.denizens[envelope.request.from].response(this.time, envelope.request, envelope.responses)
    }
}

Network.prototype.send = function () {
    var vargs = Array.prototype.slice.call(arguments)
    var count = typeof vargs[0] == 'number' ? vargs.shift() : Infinity
    var denizens = []
    while (typeof vargs[0] == 'string') {
        denizens.push(vargs.shift())
    }
    var matches = [], intercepted = {}
    while (Array.isArray(vargs[0])) {
        var failure = vargs.shift()
        matches.push({
            name: null,
            count: failure[0] == 'number' ? failure.shift() : 1,
            subsets: failure.length == 1 && typeof failure[0] == 'string'
                   ? [{ to: failure[0] }, { from: failure[0] }]
                   : failure
        })
    }
    var messages = vargs.shift() || {}, intercepted = {}
    for (var name in messages) {
        intercepted[name] = []
        var interception = Array.isArray(messages[name]) ? messages[name].slice() : [ messages[name] ]
        matches.push({
            name: name,
            count: interception[0] == 'number' ? interception.shift() : 1,
            subsets: interception.length == 1 && typeof interception[0] == 'string'
                   ? [{ to: interception[0] }, { from: interception[0] }]
                   : interception
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
            var communique
            while ((communique = denizen.shifter.shift()) != null) {
                sent = true
                for (var j = 0, envelope; (envelope = communique.envelopes[j]) != null; j++) {
                    MATCH: for (var k = 0, match; (match = matches[k]) != null; k++) {
                        for (var l = 0, L = match.subsets.length; l < L; l++) {
                            if (subset(envelope.request, match.subsets[l])) {
                                match.count = Math.max(0, match.count - 1)
                                if (match.count == 0) {
                                    if (match.name == null) {
                                        envelope.responses[envelope.request.to] = null
                                    } else {
                                        intercepted[match.name].push(envelope)
                                    }
                                    break MATCH
                                }
                            }
                        }
                    }
                    if (k == matches.length) {
                        this.request(envelope)
                    }
                }
                this.response(communique)
            }
        }
    }
    return intercepted
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

Network.prototype.reboot = function (i, republic) {
    var id = String(i)
    var denizen = new Paxos(this.time, coalesce(republic, 1), id, {
        parliamentSize: 5,
        ping: 1,
        timeout: 3,
        naturalized: true
    })
    denizen.scheduler.events.shifter().pump(denizen.event.bind(denizen))
    denizen.shifter = denizen.outbox.shifter()
    this.denizens[i] = denizen
}

Network.prototype.bootstrap = function () {
    this.reboot(0)
    this.denizens[0].bootstrap(this.time, { location: '0' })
}

Network.prototype.immigrate = function (i) {
    var denizen = this.denizens[i]
    this.denizens[0].immigrate(this.time, 1, denizen.id, denizen.cookie, { location: denizen.id })
}

Network.prototype.populate = function (count) {
    while (count-- != 0) {
        var i = this.denizens.length
        this.reboot(i)
        this.immigrate(i)
    }
}

Network.prototype.tick = function (count) {
    while (count-- != 0) {
        this.time++
        this.send()
    }
}

Network.prototype.pluck = function (envelopes, pluck) {
    var i = 0, plucked = []
    while (i < envelopes.length) {
        if (subSubset(envelopes[i].request, pluck)) {
            plucked.push.apply(plucked, envelopes.splice(i, 1))
        } else {
            i++
        }
    }
    return plucked
}

module.exports = Network
