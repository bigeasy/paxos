var assert = require('assert')

var noop = function () {}

function Pinger (paxos, shaper) {
    this._paxos = paxos
    this.pings = {}
    this._shaper = shaper
}

Pinger.prototype.getPing = function (id) {
    var ping = this.pings[id]
    if (ping == null) {
        ping = this.pings[id] = { id: id, naturalized: false, when: null, committed: null }
    }
    return ping
}

Pinger.prototype._updateShape = function (now, id, reacahble, committed, naturalized) {
    if (
        !reacahble &&
        !this._shaper.collapsed &&
        ~this._paxos.government.majority.indexOf(id)
    ) {
        this._shaper = { update: noop }
        this._paxos._collapse(now)
    }
    var shape = this._shaper.update(id, reacahble, committed, naturalized)
    if (shape != null) {
        this._shaper = { update: noop }
        this._paxos.newGovernment(now, shape.quorum, shape.government)
    }
}


Pinger.prototype.update = function (now, id, sync) {
    var ping = this.getPing(id)
    if (sync == null) {
        if (ping.when == null) {
            ping.when = now
        } else if (now - ping.when >= this._paxos.timeout) {
            this._updateShape(now, id, false, ping.committed, ping.naturalized)
        }
    } else {
        // TODO I believe shaper eliminates duplicates, not us.
        ping.when = null
        if (
            ping.naturalized != sync.naturalized ||
            ping.committed != sync.committed
        ) {
            ping.committed = sync.committed
            ping.naturalized = ping.naturalized
            this._updateShape(now, id, true, ping.committed, ping.naturalized)
        }
    }
}

Pinger.prototype.createPinger = function (now, paxos, shaper) {
    var pinger = new Pinger(paxos, shaper)
    var constituency = paxos.government.majority[0] == paxos.id && paxos.constituency.length != 1
                     ? paxos.government.majority.slice(1)
                     : paxos.constituency
    pinger.update(now, paxos.id, { naturalized: paxos.naturalized, committed: paxos.government.promise })
    for (var i = 0, constituent; (constituent = constituency[i]) != null; i++) {
        var ping = this.pings[constituent]
        if (ping != null) {
            if (ping.when == null) {
                pinger.update(now, constituent, ping)
            } else {
                pinger.update(ping.when, constituent, null)
            }
        }
    }
    return pinger
}

module.exports = Pinger
