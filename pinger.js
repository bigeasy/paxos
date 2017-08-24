var assert = require('assert')

var noop = function () {}

function Pinger (paxos, shaper) {
    this._paxos = paxos
    this.pings = {}
    this._shaper = shaper
}

Pinger.prototype.ingest = function (now, pinger, constituency) {
    for (var i = 0, constituent; (constituent = constituency[i]) != null; i++) {
        var ping = pinger.pings[constituent]
        if (ping != null) {
            if (ping.when == null) {
                this.update(now, constituent, ping)
            } else {
                this.update(ping.when, constituent, null)
            }
        }
    }
}

Pinger.prototype.getPing = function (id) {
    var ping = this.pings[id]
    if (ping == null) {
        ping = this.pings[id] = { id: id, naturalized: false, when: null, committed: null }
    }
    return ping
}

Pinger.prototype._updateShape = function (now, id, reacahble) {
    if (
        !reacahble &&
        !this._shaper.collapsed &&
        ~this._paxos.government.majority.indexOf(id)
    ) {
        this._shaper = { update: noop }
        this._paxos._collapse(now)
    }
    var shape = this._shaper.update(id, reacahble)
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
            this._updateShape(now, id, false)
        }
    } else {
        ping.when = null
        ping.committed = sync.committed
        if (ping.naturalized != sync.naturalized) {
            assert(sync.naturalized)
            ping.naturalized = true
            this._updateShape(now, id, true)
        }
        // TODO Schedule next ping.
    }
}

module.exports = Pinger
