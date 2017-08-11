var Monotonic = require('monotonic').asString

function Writer (paxos, promise) {
    this._paxos = paxos
    this.version = [ promise, this.collapsed = false ]
    this.proposals = []
    this._writing = []
}

Writer.prototype.nudge = function () {
    if (this._writing.length == 0 && this.proposals.length != 0) {
        this._writing.push(this.proposals.shift())
        this._paxos._send({
            version: this._version,
            to: this._writing[0].quorum,
            messages: [{
                method: 'write',
                promise: this._writing[0].promise,
                body: this._writing[0].body
            }]
        })
    }
}

Writer.prototype.response = function (now, request, responses) {
    for (var i = 0, message; message = request.messages[i]; i++) {
        switch (message.method) {
        case 'write':
            var nextRequest = {
                version: this._version,
                to: this._writing[0].quorum,
                messages: [{ method: 'commit', promise: this._writing[0].promise }]
            }
            // The quorum might change. Also, we want to make sure we're working
            // through thorugh government changes as quickly as possible without
            // ordinary business in between. Imagine an impeachment, followed by
            // exile, followed by shape change.
            if (
                this.proposals.length != 0 &&
                !Monotonic.isBoundary(this._writing[0].promise, 0) &&
                !Monotonic.isBoundary(this.proposals[0].promise, 0)
            ) {
                this._writing.push(this.proposals.shift())
                nextRequest.messages.push({
                    method: 'write',
                    promise: this._writing[1].promise,
                    body: this._writing[1].body
                })
            }
            this._paxos._send(nextRequest)
            break
        case 'commit':
            this._writing.shift()
            this.nudge()
            break
        }
    }
}

Writer.prototype.createWriter = function (promise) {
    return this
}

module.exports = Writer
