// TODO Remember that the code is more complicated than the messaging. Let the
// messages absorb some of the complexity of the code. (Divide them. Restrict
// their structure.)

function Recorder (paxos) {
    this._paxos = paxos
    this._register = null
}

Recorder.prototype.request = function (request) {
    var responses = []
    for (var i = 0, request; (request = requests[i]) != null; i++) {
        switch (request.method) {
        case 'write':
            this._register = {
                promise: request.promise,
                value: request.value
            }
            responses.push({ promise: request.promise, method: 'written' })
            break
        case 'commit':
            if (message.promise == this._register.promise) {
                var resgister = [ this._register, this._register = null ][0]
                responses.push({ promise: request.promise, method: 'committed' })
                this._paxos.commit({
                    promise: register.promise,
                    value: register.value
                })
            }
            break
        }
    }
}

Recorder.prototype.createRecorder = function () {
    return this
}

module.exports = Recorder
