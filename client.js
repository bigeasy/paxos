var assert = require('assert')
var Monotonic = require('monotonic')
var RBTree = require('bintrees').RBTree
var Id = require('./id')
var unshift = [].unshift

function Client (id) {
    this.id = id
    this.boundary = null
    this.flush = false
    this.cookie = id + '/' + 0
    this.sent = { ordered: [], indexed: {} }
    this.pending = { ordered: [], indexed: {} }
    this.length = 0
    this.log = new RBTree(function (a, b) { return Id.compare(a.promise, b.promise) })
}

Client.prototype.publish = function (value, internal) {
    var cookie = this.nextCookie()
    var request = { cookie: cookie, value: value, internal: !!internal }
    this.pending.ordered.push(request)
    this.pending.indexed[cookie] = request
    return cookie
}

Client.prototype.nextCookie = function () {
    return this.cookie = Id.increment(this.cookie, 1)
}

Client.prototype.outbox = function () {
    var outbox = []
    if (this.flush) {
        outbox = [{ cookie: this.nextCookie(), value: 0 }]
    } else if (!this.boundary && this.sent.ordered.length == 0 && this.pending.ordered.length != 0) {
        this.sent = this.pending
        outbox = this.sent.ordered.map(function (request) {
            return { cookie: request.cookie, value: request.value, internal: request.internal }
        }, this)
        this.pending = { ordered: [], indexed: {} }
    }
    return outbox
}

Client.prototype.published = function (receipts) {
    if (receipts.length === 0) {
        this.flush = true
    } else if (this.flush) {
        assert(receipts.length == 1, 'too many receipts')
        this.flush = false
        this.boundary = receipts[0]
    } else {
        receipts.forEach(function (receipt) {
            assert(!this.sent.indexed[receipt.cookie].promise, 'duplicate receipt')
            this.sent.indexed[receipt.cookie].promise = receipt.promise
        }, this)
    }
    delete this.sent.indexed
}

Client.prototype.prime = function (entries) {
    if (entries.length) {
        this._ingest(entries)
        this.uniform = this.log.min().promise
        this.length = 1
        this.log.min().uniform = true
        this.playUniform()
    }
}

Client.prototype.retry = function () {
    unshift.apply(this.pending.ordered, this.sent.ordered)
    this.sent.ordered.forEach(function (request) {
        this.pending.indexed[request.cookie] = request
    }, this)
    this.sent.ordered.length = 0
}

Client.prototype.playUniform = function (entries) {
    var start = this.uniform, iterator = this.log.findIter({ promise: start }),
        previous, current,
        request

    for (;;) {
        previous = iterator.data(), current = iterator.next()
        if (!current) {
            break
        }
        current.uniform = current.previous == previous.promise
        if (!current.uniform) {
            break
        }
        this.uniform = current.promise
        this.length++
        var request = this.sent.ordered[0] || { cookie: '/' }, boundary = this.boundary
        if (request.cookie == current.cookie) {
            assert(request.promise == null
                || Id.compare(request.promise, current.promise) == 0, 'cookie/promise mismatch')
            this.sent.ordered.shift()
        } else if (messagesLost.call(this)) {
            if (Id.isGovernment(current.promise) && current.value && current.value.remap) {
                if (this.boundary) {
                    var mapping = current.value.remap.filter(function (mapping) {
                        return this.boundary.promise == mapping.was
                    }, this).shift()
                    assert(mapping, 'remap did not include posted boundary')
                    this.boundary.promise = mapping.is
                } else {
                    var remapped = []
                    current.value.remap.forEach(function (mapping) {
                        if (this.sent.ordered.length && mapping.was == this.sent.ordered[0].promise) {
                            var request = this.sent.ordered.shift()
                            request.promise = mapping.is
                            remapped.push(request)
                        }
                    }, this)
                    assert(this.sent.ordered.length == 0, 'remap did not remap all posted entries')
                    this.sent.ordered = remapped
                }
            } else {
                this.retry()
            }
            delete this.boundary
        }
    }

    function messagesLost () {
        return (boundary && Id.compare(current.promise, boundary.promise) >= 0) ||
               (request.promise && Id.compare(current.promise, request.promise) > 0)
    }

    return start
}

Client.prototype._ingest = function (entries) {
    entries.forEach(function (entry) {
        var found = this.log.find({ promise: entry.promise })
        if (!found) {
            this.log.insert(entry)
        }
    }, this)
}

Client.prototype.receive = function (entries) {
    this._ingest(entries)
    return this.playUniform()
}

Client.prototype.since = function (marker, callback) {
    var iterator = this.log.findIter({ promise: marker })
    assert(iterator, 'promise not found')
    var entries = [], entry
    while ((entry = iterator.next()) && entry.uniform) {
        entries.push(entry)
    }
    return entries
}

Client.prototype.each = function (marker, callback) {
    var iterator = this.log.findIter({ promise: marker })
    assert(iterator, 'promise not found')
    var entry
    while ((entry = iterator.next()) && entry.uniform) {
        callback(entry)
    }
}

Client.prototype.shift = function () {
    if (this.length > 1) {
        this.log.remove(this.log.min())
        this.length--
        return true
    }
    return false
}

Client.prototype.clear = function () {
    var waiting = this.sent.ordered.concat(this.pending.ordered)
    Client.call(this)
    return waiting
}

module.exports = Client
