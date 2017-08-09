var Procession = require('procession')
var Proposer = require('./proposer')
var Acceptor = require('./legislator')

function Redux (id) {
    this.id = id
    this.outbox = new Procession
}

Redux.prototype.bootstrap = function (now, republic, properties) {
    this.now = now
    this.republic = republic
    this.writer = new Proposer({
        majority: [ this.id ],
        minority: [],
        constituents: []
    }, '0/0', this.outbox)
    this.recorder = new Acceptor('0/0', this.id)
    this.writer.prepare()
}

Redux.prototype.request = function (pulse) {
    return this.recorder.request(pulse)
}

Redux.prototype.response = function (pulse, responses) {
    this.writer.response(pulse, responses)
}

Redux.prototype._nudge = function (now) {
}

module.exports = Redux
