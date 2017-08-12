var assert = require('assert')

function Pinger (shape, timeout) {
    this._pings = {}
    this._timeout = timeout
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
        ping = this._pings[id] = { id: id, naturalized: false, when: null, committed: 'x' }
    }
    return ping
}

Pinger.prototype.update = function (now, id, sync) {
    var ping = this.getPing(id)
    if (sync == null) {
        if (ping.when == null) {
            ping.when = now
        } else if (now - ping.when > this._timeout) {
            this._shape.update(id, false)
        }
    } else {
        if (ping.naturalized != sync.naturalized) {
            assert(sync.naturalized)
            ping.naturalized = true
            this._shape.update(id, true)
        }
        ping.when = null
        ping.committed = sync.committed
        // TODO Schedule next ping.
    }
}

module.exports = Pinger
