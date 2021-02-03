var Paxos = require('..')
var { coalesce } = require('extant')
var Monotonic = require('../monotonic')

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
    envelope.responses[envelope.to] = this.denizens[envelope.to].request(this.time, JSON.parse(JSON.stringify(envelope.request)))
}

Network.prototype.response = function (envelope) {
    if (Object.keys(envelope.responses).length == envelope.cookie.message.to.length) {
        this.denizens[envelope.from].response(this.time, envelope.cookie, envelope.responses)
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
                            if (subset(envelope, match.subsets[l])) {
                                match.count = Math.max(0, match.count - 1)
                                if (match.count == 0) {
                                    if (match.name == null) {
                                        envelope.responses[envelope.to] = null
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

function createDenizen (id) {
    var denizen = new Paxos(this.time, id, {
        parliamentSize: 5,
        ping: 1,
        timeout: 3
    })
    denizen.intercept = []
    denizen.events = []
    denizen.scheduler.on('data', (event) => {
        if (
            event.body.method == 'synchronize' &&
            event.body.to.filter(function (to) {
                return ~denizen.intercept.indexOf(to)
            }).length != 0
        ) {
            denizen.events.push(event)
        } else {
            denizen.event(event)
        }
    })
    denizen.shifter = denizen.outbox.shifter().sync
    return denizen
}

Network.prototype.push = function () {
    this.denizens.push(createDenizen(String(this.denizens.length)))
}

Network.prototype.reboot = function (i, republic) {
    this.denizens[i] = createDenizen(String(i))
}

Network.prototype.bootstrap = function (republic) {
    this.reboot(0)
    this.denizens[0].bootstrap(coalesce(republic, 1), this.time, { location: '0' })
}

Network.prototype.embark = function (i) {
    var denizen = this.denizens[i]
    var leader = this.denizens.map(function (denizen) {
        return denizen.government
    }).sort(function (left, right) {
        return Monotonic.compare(left.promise, right.promise)
    }).pop().majority[0]
    denizen.join(1, this.time)
    this.denizens[leader].embark(this.time, 1, denizen.id, denizen.cookie, { location: denizen.id }, true)
}

Network.prototype.populate = function (count) {
    while (count-- != 0) {
        var i = this.denizens.length
        this.reboot(i)
        this.embark(i)
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
        if (subSubset(envelopes[i], pluck)) {
            plucked.push.apply(plucked, envelopes.splice(i, 1))
        } else {
            i++
        }
    }
    return plucked
}

module.exports = Network
