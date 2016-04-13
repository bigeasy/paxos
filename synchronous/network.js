function Network () {
    this.machines = []
    this.gremlins = []
    this.gremlinId = 0
}

Network.prototype.addGremlin = function (gremlin) {
    this.gremlins.push(gremlin)
    return gremlin
}

Network.prototype.removeGremlin = function (gremlin) {
    this.gremlins = this.gremlins.filter(function (f) {
        return f !== gremlin
    })
}

Network.prototype.post = function (now, pulse, index) {
    var returns = this._post(now, JSON.parse(JSON.stringify(pulse)), index)
    return JSON.parse(JSON.stringify(returns))
}

Network.prototype._post = function (now, pulse, index, envelopes) {
    if (false) this.gremlins.forEach(function (gremlin) {
        if (gremlin('before', route, index, envelopes)) {
            envelopes = []
        }
    }, this)
    var machine = this.machines.filter(function (machine) {
        return machine.legislator.id == pulse.route[index]
    }).shift()
    var returns = machine.receive(now, pulse, index)
    if (false) this.gremlins.forEach(function (gremlin) {
        if (gremlin('after', route, index, returns)) {
            returns = []
        }
    }, this)
    return returns
}

Network.prototype.schedule = function (now) {
    var scheduled = false
    this.machines.forEach(function (machine) {
        scheduled = machine.legislator.checkSchedule(now) || scheduled
    })
    return scheduled
}

Network.prototype.tick = function (now) {
    var ticked, looped = true
    while (looped) {
        looped = false
        this.machines.forEach(function (machine) {
            if (machine.tick(now)) {
                looped = true
                ticked = true
            }
        })
    }
    return ticked
}

module.exports = Network
