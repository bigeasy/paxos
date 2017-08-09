var Monotonic = require('monotonic')

// An evented message queue used for the atomic log.
var Window = require('procession/window')
var Procession = require('procession')

// A sorted index into the atomic log. TODO Must it be a tree?
var Indexer = require('procession/indexer')

var Proposer = require('./proposer')
var Acceptor = require('./acceptor')

function Redux (id) {
    this.id = id
    this.outbox = new Procession
    this.log = new Window
    this.log.addListener(this.indexer = new Indexer(function (left, right) {
        assert(left && right)
        assert(left.body && right.body)
        return Monotonic.compare(left.body.promise, right.body.promise)
    }))
    this.log.push({
        module: 'paxos',
        promise: '0/0',
        body: this.government
    })
}

Redux.prototype.bootstrap = function (now, republic, properties) {
    this.now = now
    this.republic = republic
    this.writer = new Proposer({
        majority: [ this.id ],
        minority: [],
        constituents: []
    }, '0/0', this.outbox)
    this.recorder = new Acceptor('0/0', this.id, this)
    this.writer.prepare()
}

Redux.prototype.request = function (pulse) {
    return this.recorder.request(pulse)
}

Redux.prototype.response = function (pulse, responses) {
    this.writer.response(pulse, responses)
}

Redux.prototype.enact = function (entry) {
    var entries = []
    while (entry) {
        entries.push({ promise: entry.promise, value: entry.value })
        entry = entry.previous
    }

    while (entries.length != 0) {
        entry = entries.shift()

        var max = this.log.head.body

        var valid = Monotonic.compare(max.promise, entry.promise) < 0

        if (!valid) {
            break
        }

        valid = max.promise != '0/0'
        if (!valid) {
            valid = max.promise == '0/0' && entry.promise == '1/0'
        }

        if (!valid) {
            valid = Monotonic.isBoundary(message.promise, 0)
            valid = valid && this.log.trailer.peek().promise == '0/0'
            valid = valid && message.body.immigrate
            valid = valid && message.body.immigrate.id == this.id
            valid = valid && message.body.immigrate.cookie == this.cookie
        }

        if (!valid) {
            break
        }

        var isGovernment = Monotonic.isBoundary(entry.promise, 0)
        if (isGovernment) {
            this._enactGovernment()
        }
    }
}

Redux.prototype._enactGovernment = function (entry) {
}

module.exports = Redux
