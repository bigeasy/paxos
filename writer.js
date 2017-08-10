function Writer (proposals, promise) {
    this.version = [ promise, this.collapsed = false ]
    this._proposals = proposals
    this._writing = []
}

Writer.prototype.nudge = function () {
    if (this._writing.length == 0 && this._proposals.length != 0) {
        // TODO So in order for it to be event driven it needs to go into a
        // procession and then somewhere the sync needs to be added.
    }
}

Writer.prototype._writeIf = function (condition, responses) {
    if (this._proposals.length && condition) {
        this._writing.push(this._proposals.shift())
        responses.push({
            to: this._quorum,
            method: 'write',
            promise: this._writing[0].promise
        })
    }
}

Writer.prototype.response = function (messages) {
    var requests = []
    for (var i = 0; i < messages.length; i++) {
        var message = messages[i]
        switch (message.method) {
        case 'write':
            if (message.promise == (this._writing[0] || {}).promise) {
                requests.push({
                    to: this._quorum,
                    method: 'commit',
                    promise: this._writing[0].promise
                })
            }
            this._writeIf(!Monotonic.isBoundary(this._proposal.promise, 0), messages)
            return responses
        case 'commit':
            var responses = []
            this._writeIf(Monotonic.isBoundary(this._proposal.promise, 0), messages)
            if (message.promise == this._writing[0].promise) {
                this._writing.shift()
            }
            return responses
        }
    }
}

Writer.prototype.createWriter = function () {
    return this
}

module.exports = Writer
