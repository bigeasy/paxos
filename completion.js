var Writer = require('./writer')

function Completion (paxos, version, promise) {
    this.version = version
    this._paxos = paxos
    this._promise = promise
}

Completion.prototype.response = function (now, request, response) {
    switch (request.method) {
    case 'commit':
        this._paxos._writer = new Writer(this._paxos, this._promise)
        break
    }
}

Completion.prototype.createWriter = function (promise) {
    return new Writer(this._paxos, promise)
}

module.exports = Completion
