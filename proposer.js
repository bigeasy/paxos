var assert = require('assert')

var Monotonic = require('monotonic').asString

// TODO Convert from a government structure.
function Proposer (government, promise, queue) {
    this.state = 'preparing'
    this.government = government
    this.promise = Monotonic.increment(promise, 0)
    this.previous = null
    this.queue = queue
}

Proposer.prototype.prepare = function () {
    this.queue.push({
        method: 'prepare',
        to: this.government.majority,
        promise: this.promise
    })
}

function getPromise (object) {
    return object == null ? '0/0' : object.promise
}

Proposer.prototype.response = function (pulse, responses) {
    var method = pulse.method
    for (var id in responses) {
        if (responses[id] == null) {
            method = 'failed'
        } else if (responses[id].method == 'reject') {
            method = 'failed'
            if (Monotonic.compare(this.promise, responses[id].promise) < 0) {
                this.promise = responses[id].promise
            }
        }
    }
    switch (method) {
    case 'failed':
        break
    case 'prepare':
        for (var id in responses) {
            if (Monotonic.compare(getPromise(this.previous), getPromise(responses[id].register)) < 0) {
                this.previous = responses[id].register
            }
        }
        this.queue.push({
            method: 'accept',
            to: this.government.majority,
            promise: this.promise,
            value: this.government,
            previous: this.previous
        })
        break
    case 'accept':
        this.queue.push({
            method: 'commit',
            to: this.government.majority,
            promise: this.promise
        })
        break
    case 'commit':
        break
    }
}

module.exports = Proposer
