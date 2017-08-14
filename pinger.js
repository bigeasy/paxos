var assert = require('assert')

var noop = function () {}

function Pinger (paxos, shape) {
    this._paxos = paxos
    this._pings = {}
    this._shape = shape
}

Pinger.prototype.ingest = function (now, pinger, constituency) {
    for (var i = 0, constituent; (constituent = constituency[i]) != null; i++) {
        var ping = pinger._pings[constituent]
        if (ping != null) {
            this.update(now, constituent, ping.when ? null : ping)
        }
    }
}

Pinger.prototype.getPing = function (id) {
    var ping = this._pings[id]
    if (ping == null) {
        ping = this._pings[id] = { id: id, naturalized: false, when: null, committed: null }
    }
    return ping
}

Pinger.prototype._updateShape = function (now, id, reacahble) {
    if (
        !reacahble &&
        !this._shape.collapsed &&
        ~this._paxos.government.majority.indexOf(id)
    ) {
        this._shape = { update: noop }
        this._paxos._collapse(now)
    }
    var shape = this._shape.update(id, reacahble)
    if (shape != null) {
        this._shape = { update: noop }
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
        if (ping.naturalized != sync.naturalized) {
            assert(sync.naturalized)
            ping.naturalized = true
            this._updateShape(now, id, true)
        }
        ping.when = null
        ping.committed = sync.committed
        // TODO Schedule next ping.
    }
}

module.exports = Pinger
