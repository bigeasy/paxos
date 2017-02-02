var assert = require('assert')
var Monotonic = require('monotonic').asString
var Scheduler = require('happenstance')
var push = [].push
var slice = [].slice
var Indexer = require('procession/indexer')
var Procession = require('procession')
var logger = require('prolific.logger').createLogger('paxos')

function Legislator (id, options) {
    assert(arguments.length == 2, 'only two arguments now')

    this.id = String(id)
    this.naturalized = !! options.naturalized

    this.parliamentSize = options.parliamentSize || 5

    this.log = new Procession
    this.log.addListener(this.indexer = new Indexer(function (left, right) {
        assert(left && right)
        assert(left.body && right.body)
        assert(left.body.body.promise && right.body.body.promise)
        return Monotonic.compare(left.body.body.promise, right.body.body.promise)
    }))
    this.scheduler = new Scheduler(options.scheduler || {})
    this.synchronizing = {}

    // This is the right data structure for the job. It is an array of proposals
    // that can have at most one proposals for a new government, where that
    // proposal is unshifted into the array and all the subsequent proposals
    // have their promises remapped to the new government.
    //
    // Returning to this, I felt that it made no sense, just push the new
    // governent onto the end of the array, but then you're moving toward scan
    // the array for an existing government to assert that it is not there, or
    // else queuing governments based on either the current government, or the
    // last future government pushed onto the proposal array.
    //
    // Although it's not multi-dimensional, I see this structure in my mind as
    // somehow ether dash shapped, an array of just proposals, or L shaped an
    // array of proposals with a new government unshifted.
    //
    // Sometimes there's a scout leader, and sometimes there's not.
    //
    // But, the array is the correct structure. It makes the remapping easy.
    //
    // Governments jumping the gun is the right way to go, and here's how we
    // prioritize them, by constantly unshifting only the next one onto the
    // array.
    //
    // This means that there is a queue of awaiting governments. It is, however,
    // implicit. We will review our current government when we create a new one,
    // and when a ping changes the reachable state of a constituent. Recall that
    // a new government is formed to immigrate or exile a citizen.
    //
    this.proposals = []
    this.immigrating = []
    this.keepAlive = false
    this.pulsing = false
    this.collapsed = false

    this.government = {
        promise: '0/0',
        minority: [],
        majority: [],
        properties: {},
        immigrated: { id: {}, promise: {} }
    }

    this.lastIssued = null
    this.promise = '0/0'

    this.pings = {}
    this.getPing(this.id).timeout = 0

    this.length = options.length || 1024

// TODO Randomly adjust election retry by a percentage. Randomly half or
// randomly half as much again.

    this.ping = options.ping || 1
    this.timeout = options.timeout || 3

    this.least = this.log.shifter()

    this.constituency = []
    this.operations = []
    this.citizens = []
    this.minimum = '0/0'

    this.outbox = new Procession
    this.shifter = options.shifter ? this.outbox.shifter() : null
}

// Common initialization for bootstrap and join is the creation of the dummy
// first entry.

//
Legislator.prototype._begin = function () {
    this.log.push({
        module: 'paxos',
        promise: '0/0',
        value: { government: this.government }
    })
}

// Minimal helper method to shave some verbosity on the tracing messages. Might
// want to remove it and accept the verbosity.

//
Legislator.prototype._trace = function (method, vargs) {
    logger.trace(method, { $vargs: vargs })
}

Legislator.prototype.getPing = function (id) {
    var ping = this.pings[id]
    if (ping == null) {
        ping = this.pings[id] = {
            id: id,
// Whoa. Which is it?
            when: -Infinity,
            timeout: 1,
            when: null,
// TODO Use a `null` decided instead.
            pinged: false,
            decided: '0/0'
        }
    }
    return ping
}

// We are only ever supposed to call `newGovernment` when we are not in the
// process of forming a new government. There is only ever supposed to be one in
// process or in the queue. You'll notice that we call `newGovernment` during
// bootstrap, during consensus selection and during collapse. Many decisions
// about the new goverment are based on the current government, so we can't have
// them queued up, unless we want to also maintain the latest version of the
// government we hope to have someday, which offends my pragmatic sensibilities.
Legislator.prototype.newGovernment = function (now, quorum, government, promise) {
    this._trace('newGovernment', [ now, quorum, government, promise ])
    assert(!government.constituents)
    government.constituents = Object.keys(this.government.properties).sort().filter(function (citizen) {
        return !~government.majority.indexOf(citizen)
            && !~government.minority.indexOf(citizen)
    })
// TODO Creating this reissue, but then I'm never using it.
    var remapped = government.promise = promise, map = {}
    this.proposals = this.proposals.splice(0, this.proposals.length).map(function (proposal) {
        proposal.was = proposal.promise
        proposal.route = government.majority
        proposal.promise = remapped = Monotonic.increment(remapped, 1)
        map[proposal.was] = proposal.promise
        return proposal
    }.bind(this))
    this.lastIssued = remapped
    var properties = JSON.parse(JSON.stringify(this.government.properties))
    var immigrated = JSON.parse(JSON.stringify(this.government.immigrated))
// TODO I'd rather have a more intelligent structure.
    if (government.immigrate) {
        properties[government.immigrate.id] = JSON.parse(JSON.stringify(government.immigrate.properties))
        government.constituents.push(government.immigrate.id)
        immigrated.promise[government.immigrate.id] = promise
        immigrated.id[promise] = government.immigrate.id
    }
// TODO Null map to indicate collapse or change in leadership. Wait, change in
// leader is only ever collapse? Ergo...
    government.map = this.collapsed ? null : map
    government.immigrated = immigrated
    government.properties = properties
    assert(this.proposals.length == 0 || !Monotonic.isBoundary(this.proposals[0].promise, 0))
    this.proposals.unshift({
        promise: promise,
        route: quorum,
        value: government
    })
}

// TODO When we collapse, let's change our constituency to our parliament,
// except ourselves, to ensure that we're pinging away and waiting for a
// consensus to form. Wait, we're already doing that.
//
// TODO Okay, so let's create our constituency tree, so we know how to propagate
// messages back to the leader.
Legislator.prototype._gatherProposals = function (now) {
    var parliament = this.government.majority.concat(this.government.minority)
// TODO The constituent must be both connected and synchronized, not just
// connected.
    var present = this.parliament.filter(function (id) {
        return id != this.id && (this.pings[id] || {}).timeout == 0
    }.bind(this))
    if (present.length + 1 < this.government.majority.length) {
        return null
    }
    var majority = [ this.id ].concat(present).slice(0, this.government.majority.length)
    var minority = this.parliament.filter(function (id) { return ! ~majority.indexOf(id) })
    this.election = {
        status: 'proposing',
        majority: majority,
        minority: minority,
        promises: [],
        accepts: []
    }
    return {
        type: 'consensus',
        islandId: this.islandId,
        governments: [ this.government.promise ],
        route: majority,
        messages: [{
            type: 'propose',
            // Do not increment here, it will be set by `_receivePromise`.
            promise: Monotonic.increment(this.promise, 0)
        }]
    }
}

Legislator.prototype._advanceElection = function (now) {
// TODO Currently, your tests are running all synchronizations to completion
// before running a consensus pulse, so we're not seeing the results of decided
// upon a consensus action before all of the synchronizations have been
// returned.
    if (this.election.status == 'proposed') {
        if (this.election.accepts.length != this.election.promises.length) {
            return
        }
        this.collapsed = false
        return {
            type: 'consensus',
            islandId: this.islandId,
            governments: [ this.government.promise, this.accepted.promise ],
// TODO Real weird. Yes, at this point, we have definately accepted our own
// election, replacing whatever was accepted when we sent our proposal.
            route: this.accepted.route,
// TODO Does ping belong everywhere still?
            messages: [this._ping(now), {
                type: 'commit',
                promise: this.accepted.promise
            }]
        }
// TODO We'll never see this, so we should just assert it. It would be marked
// failed.
    } else {
        assert(this.election.promises.length == this.election.majority.length)
        this.election.status = 'proposed'
        this.newGovernment(now, this.election.majority, {
            majority: this.election.majority,
            minority: this.election.minority
        }, this.promise)
        return this._stuffProposal([ this._ping(now) ], this.proposals.shift())
    }
}

Legislator.prototype._twoPhaseCommit = function (now) {
    var messages = [ this._ping(now) ]
// TODO Bring immigration cleanup up here.
// TODO Tidy.

// TODO All this should be put into a function that checks for a next government
// and puts it onto a queue. It could jump the queue, sure, but I'm leaning
// toward just putting it in the queue in it's place.
//
// Actually, I'm in a hurry to grow the queue when the government is small, the
// worst case is when the government is only one member, so in that worst case,
// draining the queue is pretty much synchronous, pretty much instant.
//
// Pretty much.
    if (this.accepted && Monotonic.isBoundary(this.accepted.promise, 0)) {
        return {
            type: 'consensus',
            islandId: this.islandId,
            governments: [ this.government.promise, this.accepted.promise ],
            route: this.accepted.route,
            messages: [this._ping(now), {
                type: 'commit',
                promise: this.accepted.promise
            }]
        }
    }

    // Shift the ids any citizens that have already immigrated.
    while (
        this.immigrating.length != 0 &&
        this.government.immigrated.promise[this.immigrating[0].id]
    ) {
        this.immigrating.shift()
    }

    var isGovernment = this.proposals.length &&
                       Monotonic.isBoundary(this.proposals[0].promise, 0)

    if (!isGovernment) {
        if (this.immigrating.length) {
            var immigration = this.immigrating.shift()
            this.newGovernment(now, this.government.majority, {
                majority: this.government.majority,
                minority: this.government.minority,
                immigrate: {
                    id: immigration.id,
                    properties: immigration.properties,
                    cookie: immigration.cookie
                }
            }, Monotonic.increment(this.promise, 0))
            isGovernment = true
        } else { // if (this.ponged) {
            var reshape = this._impeach() || this._expand() || this._shrink() || this._exile()
            if (reshape) {
                this.newGovernment(now, reshape.quorum, reshape.government, Monotonic.increment(this.promise, 0))
                isGovernment = true
            } else {
                this.ponged = false
            }
        }
    }

    if (this.accepted != null) {
        messages.push({
            type: 'commit',
            promise: this.accepted.promise
        })
        if (this.proposals.length == 0 || isGovernment) {
            return {
                type: 'consensus',
                islandId: this.islandId,
                governments: [ this.government.promise ],
                route: this.accepted.route,
                messages: messages
            }
        }
    }

    var proposal = this.proposals.shift()
    if (proposal != null) {
        return this._stuffProposal(messages, proposal)
    }

    return null
}

Legislator.prototype._consensus = function (now) {
    this._trace('consensus', [ now ])
    if (this.collapsed) {
        if (this.election) {
            return this._advanceElection(now)
        } else {
            return this._gatherProposals(now)
        }
    } else if (this.government.majority[0] != this.id) {
        return null
    }
    return this._twoPhaseCommit(now)
}

// Find a round of paxos in the log based on the given promise.
//
// Not loving how deeply nested these conditions and keys are, but I understand
// why it is that way, and it would be a full wrapper of `bintrees` to fix it.

//
Legislator.prototype._findRound = function (sought) {
    return this.indexer.tree.find({ body: { body: { promise: sought } } })
}

Legislator.prototype._stuffProposal = function (messages, proposal) {
    proposal.route.slice(1).forEach(function (id) {
        var ping = this.getPing(id)
        assert(ping.pinged)
        this._pushEnactments(messages, this._findRound(ping.decided), -1)
    }, this)
    var previous = this.collapsed ? this.accepted : null
    messages.push({
        type: 'accept',
        promise: proposal.promise,
        value: proposal.value,
        previous: previous
    })
    return {
        type: 'consensus',
        islandId: this.islandId,
        governments: [ this.government.promise ],
        route: proposal.route.slice(),
        messages: messages
    }
}

Legislator.prototype._nudge = function (now) {
    assert(now != null)
    this._trace('nudge', [ now ])
    var pulse = null
    if (!this.pulsing) {
        pulse = this._consensus(now)
        this.pulsing = !! pulse
    }
    if (pulse != null) {
        this.scheduler.unschedule(this.id)
        this.outbox.push(pulse)
    }
    return this.pulsing
}

Legislator.prototype._stuffSynchronize = function (now, ping, messages) {
    if (ping.pinged) {
        var iterator

        if (ping.decided == '0/0') {
            iterator = this.least.node.next
            for (;;) {
// TODO This will abend if the naturalization falls off the end end of the log.
// You need to check for gaps and missing naturalizations and then timeout the
// constituents that will never be connected.
                if (iterator == null) {
                    return false
                }
                // assert(round, 'cannot find immigration')
                if (Monotonic.isBoundary(iterator.body.body.promise, 0)) {
                    var immigrate = iterator.body.body.value.immigrate
                    if (immigrate && immigrate.id == ping.id) {
                        break
                    }
                }
                iterator = iterator.next
            }
        } else {
// TODO Got a read property of null here.
            iterator = this._findRound(ping.decided)
        }

        this._pushEnactments(messages, iterator, 20)
    }
    return true
}

Legislator.prototype._pushEnactments = function (messages, iterator, count) {
    while (--count && iterator != null) {
        messages.push({
            type: 'enact',
            promise: iterator.body.body.promise,
            value: iterator.body.body.value
        })
        iterator = iterator.next
    }
}

Legislator.prototype.receive = function (now, pulse, messages) {
    this._trace('receive', [ now, pulse, messages ])
    assert(arguments.length == 3 && now != null)
    var responses = []
    for (var i = 0, I = messages.length; i < I; i++) {
        var message = messages[i]
        var type = message.type
        var method = '_receive' + type[0].toUpperCase() + type.substring(1)
        this[method].call(this, now, pulse, message, responses)
    }
    return responses
}

Legislator.prototype.collapse = function (now) {
    this._trace('collapse', [])
// TODO Combine into a single state flag.
    this.collapsed = true
    this.election = null
    // Blast all queued work.
    this.proposals.length = 0
    this.immigrating.length = 0
    // Blast all knowledge of pings.
    for (var id in this.pings) {
        if (id != this.id) {
            delete this.pings[id]
        }
    }

    // Cancel all timers.
    this.citizens.forEach(function (id) { this.scheduler.unschedule(id) }, this)

    // Ping other parliament members until we can form a government.
    //
    // TODO Looks like constituency is not important in that it doesn't drive
    // pings. Pings go from ping to timeout assertion to ping. Maybe double
    // check eventually?
    this.constituency = this.government.majority
                                       .concat(this.government.minority)
                                       .filter(function (id) {
        return this.id != id
    }.bind(this))

    this.constituency.forEach(function (id) {
        this.scheduler.schedule(now, id, {
            object: this, method: '_whenPing'
        }, id)
    }, this)
}

Legislator.prototype.sent = function (now, pulse, responses) {
    this._trace('sent', [ now, pulse, responses ])
    if (pulse.type == 'consensus') {
        this.pulsing = false
    }
// TODO Sense that it is easier to keep an array of governments from and to that
// might have a duplicate government, but it's just a sense, and as I write
// this, I sense that it is wrong.
// TODO The cryptic message above requires an attempt to decypher.
    if (!~pulse.governments.indexOf(this.government.promise)) {
        return
    }
    var success = true
    pulse.route.forEach(function (id) {
        if (responses[id] == null) {
            success = false
        } else {
            this.receive(now, pulse, responses[id])
        }
    }, this)
    success = success && !pulse.failed
    if (success) {
        switch (pulse.type) {
        case 'synchronize':
            var pong = responses[pulse.route[0]].filter(function (message) {
                return message.type == 'pong'
            }).shift()
            var delay = pong.decided == this.getPing(this.id).decided
                      ? now + this.ping : now
            this.scheduler.schedule(delay, pulse.route[0], {
                object: this,
                method: '_whenPing'
            }, pulse.route[0])
            break
        case 'consensus':
            if (!this._nudge(now)) {
                this.scheduler.schedule(now + this.ping, this.id, {
                    object: this,
                    method: '_whenKeepAlive'
                })
            }
            // Determine the minimum log entry promise.
            //
            // You might feel a need to guard this so that only the leader runs
            // it, but it works of anyone runs it. If they have a ping for every
            // citizen, they'll calculate a minimum less than or equal to the
            // minimum calculated by the actual leader. If not they do not have
            // a ping record for every citizen, they'll continue to use their
            // current minimum.
            this.getPing(this.id).pinged = true
            this.getPing(this.id).decided = this.log.head.body.body.promise
            this.minimum = this.citizens.reduce(function (minimum, citizen) {
                if (minimum == null) {
                    return null
                }
                var ping = this.getPing(citizen)
                if (!ping.pinged) {
                    return null
                }
                return Monotonic.compare(ping.decided, minimum) < 0 ? ping.decided : minimum
            }.bind(this), this.log.head.body.body.promise) || this.minimum
            break
        }
    } else {
        switch (pulse.type) {
        case 'consensus':
            this.collapse(now)
            break
        case 'synchronize':
            delete this.synchronizing[pulse.route[0]]
// TODO Make this a call to receive ping.
            var ping = this.getPing(pulse.route[0])
            if (ping.when == null) {
                ping.when = now
                ping.timeout = 1
            } else {
                ping.timeout = now - ping.when
            }
//            ping.pinged = true
            ping.skip = true
            this.ponged = true
            this.scheduler.schedule(now + this.ping, pulse.route[0], {
                object: this, method: '_whenPing'
            }, pulse.route[0])
            break
        }
    }
}

Legislator.prototype.bootstrap = function (now, islandId, properties) {
    this._trace('bootstrap', [ now, islandId, properties ])
    this._begin()
    // Update current state as if we're already leader.
    this.naturalize()
    this.islandId = islandId
    this.government.majority.push(this.id)
    this.government.properties[this.id] = JSON.parse(JSON.stringify(properties))
    this.government.immigrated.id['1/0'] = this.id
    this.government.immigrated.promise[this.id] = '1/0'
    this.newGovernment(now, [ this.id ], {
        majority: [ this.id ],
        minority: []
    }, '1/0')
    this._nudge(now)
}

Legislator.prototype.join = function (cookie, islandId) {
    this._trace('join', [ cookie, islandId ])
    this._begin()
    this.cookie = cookie
    this.islandId = islandId
}

Legislator.prototype.naturalize = function () {
    this._trace('naturalize', [])
    this.naturalized = true
}

// TODO Is all this checking necessary? Is it necessary to return the island id
// and leader? This imagines that the client is going to do the retry, but in
// reality we often have the cluster performt the retry. The client needs to
// talk to a server that can be discovered, it can't use the Paxos algorithm for
// address resolution. From the suggested logic, it will only have a single
// address, and maybe be told of an actual leader. What happens when that
// address is lost? Don't see where returning `islandId` and leader helps at
// all. It is enough to say you failed, backoff and try again. The network layer
// can perform checks to see if the recepient is the leader and hop to the
// actual leader if it isn't, reject if it is but collapsed.
//
// Once you've externalized this in kibitz, remove it, or pare it down.
Legislator.prototype._enqueuable = function (islandId) {
    this._trace('_enqueuable', [ islandId ])
    if (this.collapsed || this.islandId != islandId) {
        return {
            enqueued: false,
            islandId: this.islandId,
            leader: null
        }
    }
    if (this.government.majority[0] != this.id) {
        return {
            enqueued: false,
            islandId: this.islandId,
            leader: this.government.majority[0]
        }
    }
}

// Note that a client will have to treat a network failure on submission as a
// failure requiring boundary detection.
Legislator.prototype.enqueue = function (now, islandId, message) {
    this._trace('enqueue', [ now, islandId, message ])

    var response = this._enqueuable(islandId)
    if (response == null) {
// TODO Bombs out the current working promise.
        var promise = this.lastIssued = Monotonic.increment(this.lastIssued, 1)
        this.proposals.push({
            promise: promise,
            route: this.government.majority,
            value: message
        })
        this._nudge(now)

        response = {
            enqueued: true,
            leader: this.government.majority[0],
            promise: promise
        }
    }

    return response
}

Legislator.prototype.immigrate = function (now, islandId, id, cookie, properties) {
    this._trace('immigrate', [ now, islandId, id, cookie, properties ])
    assert(typeof id == 'string', 'id must be a hexidecmimal string')
    var response = this._enqueuable(islandId)
    if (response == null) {
// TODO This is a note. I'd like to find a place to journal this. I'm continuing
// to take measures to allow for the reuse of ids. It still feels right to me
// that a display of government or of the census would be displayed using values
// meaningful to our dear user; Kubernetes HOSTNAMES, AWS instance names, IP
// address, and not something that is unique, which always means something that
// this verbose.
//
// Yet, here I am again contending with an issue that would be so simple if ids
// where required to be unique. When a citizen that is a constituent dies and
// restarts with the same id it will be pinged by someone in government, it will
// report that it's empty, and its representative will look for it's immigration
// record. There's a race now. Is the new instance going to immigrate before its
// pinged? Or is the representative going to search for an immigration record
// and not find one, which causes us to abend at the moment?
//
// I'd decided to resolve the missing record by syncing with a record that is
// poison and designed to fail. That takes care of the race when the
// representative beats the immigration record, but what if the immigration
// record beats the representative?
//
// In that case their will be a new government with the same represenative with
// the same consitutent, but now there will be an immigration record. The
// consituent will be naturalized. It will never have been exiled.
//
// This is a problem. Implementations are going to need to know that they've
// restarted. A participant should be exiled before it can immigrate again.
//
// Obviously, much easier if the ids are unique. Whole new id means not
// ambiguity. The new id immigrates, the old id exiles. (Unique ids are easy
// enough to foist upon our dear user implementation wise. Most implementations
// reset a process or at least an object, and that new instance can have a new
// id generated from POSIX time or UUID.)
//
// However, we do have an atomic log at our disposal, so every time I think that
// I should give up and go with unique ids, something comes along to make it
// simple. I was actually musing about how the client, if they really wanted
// pretty ids, they could just check and wait for the old id to exile, since it
// only needs to be unique in the set of current ids. Then, duh, I can do that
// same check on immigration and reject the immigration if the id already exists
// in the census.
//
// That's what you're looking at here.
//
// Now that that is done, though, is there a race condition where the
// immigration is currently being proposed? The property wouldn't be removed
// until the proposal was enacted.

//
        if (id in this.government.properties) {
            response = {
                enqueued: false,
                islandId: this.islandId,
                leader: this.government.majority[0]
            }
        } else {
// TODO However, are we checking that we're not proposing the same immigration
// twice if it added to the `immigrating` array while it is being proposed?
            this.immigrating = this.immigrating.filter(function (immigration) {
                return immigration.id != id
            })
            this.immigrating.push({
                type: 'immigrate',
                id: id,
                properties: properties,
                cookie: cookie
            })
            this._nudge(now)
            response = { enqueued: true, promise: null }
        }
    }
    return response
}

Legislator.prototype._reject = function (message) {
    this._trace('_reject', [ message ])
    return {
        type: 'reject',
        from: this.id,
        government: this.government.pulse,
        promised: this.promise
    }
}

Legislator.prototype._receiveReject = function (now, pulse, message) {
    this._trace('_receiveReject', [ now, pulse, message ])
    pulse.failed = true
}

Legislator.prototype._receivePropose = function (now, pulse, message, responses) {
    this._trace('_receivePropose', [ now, pulse, message, responses ])
// TODO Mark as collapsed, call `collapse`, let `collapse` decide?
    if (this._rejected(pulse, function (promise) {
        return Monotonic.compare(message.promise, promise) <= 0
    })) {
        responses.push(this._reject(message))
    } else {
        responses.push({
            type: 'promise',
            from: this.id,
// TODO Okay to bomb out here, we're resetting, won't be a leader I don't think.
// Should this force a collapse?
            promise: this.promise = message.promise,
            accepted: this.accepted
        })
    }
}

Legislator.prototype._receivePromise = function (now, pulse, message, responses) {
    this._trace('_receivePromise', [ now, pulse, message, responses ])
    // We won't get called if our government has been superceeded.
    assert(~pulse.governments.indexOf(this.government.promise), 'goverment mismatch')
    assert(this.election, 'no election')
    assert(!~this.election.promises.indexOf(message.from), 'duplicate promise')
    assert(~this.election.majority.indexOf(message.from), 'promise not in majority')
    this.election.promises.push(message.from)
    if (message.accepted == null) {
        return
    }
    if (this.accepted == null ||
        Monotonic.compareIndex(this.accepted.promise, message.accepted.promise, 0) < 0
    ) {
        this.accepted = message.accepted
    }
}

Legislator.prototype._rejected = function (pulse, comparator) {
    if (pulse.islandId != this.islandId) {
        return true
    }
    if (! ~pulse.governments.indexOf(this.government.promise)) {
        return true
    }
    return comparator(this.promise)
}

// The accepted message must go out on the pulse, we cannot put it in the
// unrouted list and then count on it to get drawn into a pulse, because the
// leader needs to know if the message failed. The only way the leader will know
// is if the message rides a pulse. This is worth noting because I thought, "the
// only place where the pulse matters is in the leader, it does not need to be a
// property of the legislator, it can just be a property of an envelope that
// describes a route." Not so. The message should be kept with the route and it
// should only go out when that route is pulsed. If the network calls fail, the
// leader will be able to learn immediately.

Legislator.prototype._receiveAccept = function (now, pulse, message, responses) {
    this._trace('_receiveAccept', [ now, pulse, message, responses ])
// TODO Think hard; will this less than catch both two-stage commit and Paxos?
    if (this._rejected(pulse, function (promise) {
        return Monotonic.compareIndex(promise, message.promise, 0) > 0
    })) {
        responses.push(this._reject(message))
    } else {
        this.accepted = JSON.parse(JSON.stringify(message))
// TODO Definately bombs out our latest working, issued promise...
        this.promise = this.accepted.promise
        this.accepted.route = pulse.route
        responses.push({
            type: 'accepted',
            from: this.id,
// TODO ... and bombs it out again.
            promise: this.promise = message.promise,
            accepted: this.accepted
        })
    }
}

Legislator.prototype._receiveAccepted = function (now, pulse, message) {
    this._trace('_receiveAccepted', [ now, pulse, message ])
    assert(~pulse.governments.indexOf(this.government.promise))
    if (this.election) {
        assert(!~this.election.accepts.indexOf(message.from))
        this.election.accepts.push(message.from)
    }
}

// What happens if you recieve a commit message during a collapse? Currently,
// you could be sending a commit message out on the pulse of a new promise. You
// need to make sure that you don't send the commit, ah, but if you'd sent a new
// promise, you would already have worked through these things.
Legislator.prototype._receiveCommit = function (now, pulse, message, responses) {
    this._trace('_receiveCommit', [ now, pulse, message, responses ])
    if (this._rejected(pulse, function (promise) {
        return promise != message.promise
    })) {
        responses.push(this._reject(message))
    } else {
        var round = this.accepted

        this.accepted = null

        var rounds = []
        while (round) {
            rounds.push(round)
            var next = round.previous
            round.previous = null
            round = next
        }

        rounds.forEach(function (round) {
            this._receiveEnact(now, pulse, round)
        }, this)
    }
}

Legislator.prototype._receiveEnact = function (now, pulse, message) {
    this._trace('_receiveEnact', [ now, pulse, message ])

    this.proposal = null
    this.accepted = null
    this.collapsed = false
    this.election = false

    message = JSON.parse(JSON.stringify(message))

    var max = this.log.head.body.body

    // TODO Since we only ever increment by one, this could be more assertive
    // for the message number. However, I have to stop and recall whether we
    // skip values for the government number, and I'm pretty sure we do.
    //
    // TODO This implies that we can be very certain about a sync if we ensure
    // that there are no gaps in both the government series and the message
    // series, which could be done by backfilling any gaps encountered during
    // failed rounds of Paxos.

    //
    var valid = Monotonic.compare(max.promise, message.promise) < 0

    // TODO Simply skip if it is bad, but now I'm considering failing because it
    // indicates something wrong on the part of the sender, but then the sender
    // will fail, so it will timeout and try to ping again. When it does it will
    // assume that it has correct values for `decided`.

    //
    if (!valid) {
        // tentative -> pulse.failed = true
        return
    }

    valid = max.promise != '0/0'
    if (!valid) {
        // TODO Seems to be a duplicate test.
        valid = max.promise == '0/0' && message.promise == '1/0'
    }
    if (!valid) {
        // assert(this.log.size == 1)
        valid = Monotonic.isBoundary(message.promise, 0)
        valid = valid && this.least.peek().promise == '0/0'
        valid = valid && message.value.immigrate
        valid = valid && message.value.immigrate.id == this.id
        valid = valid && message.value.immigrate.cookie == this.cookie
    }
    if (!valid) {
        pulse.failed = true
        return
    }

    var isGovernment = Monotonic.isBoundary(message.promise, 0)

// TODO How crufy are these log entries? What else is lying around in them?
    max.next = message
    message.previous = max.promise
    this.log.push({
        module: 'paxos',
        method: isGovernment ? 'government' : 'entry',
        promise: message.promise,
        previous: max.promise,
        value: message.value
    })
// Forever bombing out our latest promise.
    this.promise = message.promise

    if (isGovernment) {
        this._enactGovernment(now, message)
    }

    this.getPing(this.id).decided = message.promise
}

Legislator.prototype._ping = function (now) {
    return { type: 'ping', from: this.id, collapsed: this.collapsed }
}

Legislator.prototype._pong = function (now) {
    return {
        type: 'pong',
        from: this.id,
        timeout: 0,
        when: now,
        naturalized: this.naturalized,
        decided: this.pings[this.id].decided
    }
}

Legislator.prototype._whenKeepAlive = function (now) {
    this._trace('_whenKeepAlive', [])
    this.outbox.push({
        type: 'consensus',
        islandId: this.islandId,
        governments: [ this.government.promise ],
        route: this.government.majority,
        messages: [ this._ping(now) ]
    })
}

Legislator.prototype._whenPing = function (now, id) {
    this._trace('_whenPing', [ now, id ])
    var ping = this.getPing(id)
    if (ping.timeout == 0) {
        ping.timeout = 1
    }
    var compare = Monotonic.compare(this.getPing(id).decided, this.getPing(this.id).decided)
    var messages = []
    var pulse = {
        type: 'synchronize',
        islandId: this.islandId,
        governments: [ this.government.promise ],
        route: [ id ],
        messages: messages,
        failed: ! this._stuffSynchronize(now, ping, messages)
    }
    pulse.messages.push(this._pong(now))
    pulse.messages.push(this._ping(now))
    this.outbox.push(pulse)
}

Legislator.prototype._receivePong = function (now, pulse, message, responses) {
    this._trace('_receivePong', [ now, pulse, message, responses ])
    if (!pulse.failed) {
        var ping = this.getPing(message.from)
        this.ponged = this.ponged || !ping.pinged || ping.timeout != message.timeout
        ping.pinged = true
        ping.timeout = message.timeout
        ping.naturalized = message.naturalized
        ping.decided = message.decided
        ping.when = null
        this._nudge(now)
    }
}

Legislator.prototype._receivePing = function (now, pulse, message, responses) {
    this._trace('_receivePing', [ now, pulse, message, responses ])
    if (message.from == this.id) {
        return
    }
// TODO Keep a tree to determine if a majority member needs to return the
// values send by a minority member, for now send everything.
    responses.push(this._pong(now))
    if (!message.collapsed) {
        for (var id in this.pings) {
            var ping = this.pings[id]
// TODO You can use `ping.timeout != 1` wherever you're using `ping.pinged`.
            if ((ping.pinged || ping.timeout > 1) && ping.id != message.from)  {
                responses.push({
                    type: 'pong',
                    from: ping.id,
                    timeout: ping.timeout,
                    when: ping.when,
                    naturalized: ping.naturalized,
                    decided: ping.decided
                })
            }
        }
    }
    var ping = this.getPing(message.from)
// TODO You've got some figuring to do; you went and made it so that synchronize
// will sent a `pulse` with a `failed` flag set. If that was the only place you
// where stuffing synchronize, you'd be done, but here you are. Are you going to
// find yourself in the same situation returning.
    if (pulse.type == 'synchronize' && Monotonic.compare(ping.decided, this.pings[this.id].decided) < 0) {
        this._stuffSynchronize(now, this.getPing(message.from), responses)
    }
// TODO Are you setting/unsetting this correctly when you are collapsed?
    var resetWhenCollapse =
        ~this.government.majority.slice(1).indexOf(this.id) &&
        !this.collapsed &&
        message.from == this.government.majority[0]
    if (resetWhenCollapse) {
        this.scheduler.schedule(now + this.timeout, this.id, {
            object: this, method: '_whenCollapse'
        })
    }
}

// Majority updates minority. Minority updates constituents. If there is
// no minority, then the majority updates constituents.

//
Legislator.prototype._determineConstituency = function () {
    this.constituency = []
    var parliament = this.government.majority.concat(this.government.minority)
    if (parliament.length == 1) {
        if (this.id == this.government.majority[0]) {
            this.constituency = this.government.constituents.slice()
        }
    } else {
        var index = this.government.majority.slice(1).indexOf(this.id)
        if (~index) {
            var length = this.government.majority.length - 1
            var population = this.government.minority.length
                           ? this.government.minority
                           : this.government.constituents
            this.constituency = population.filter(function (id, i) {
                return i % length == index
            })
        } else if (~(index = this.government.minority.indexOf(this.id))) {
            var length = this.government.minority.length
            this.constituency = this.government.constituents.filter(function (id, i) {
                return i % length == index
            })
        }
    }
}

Legislator.prototype._enactGovernment = function (now, round) {
    this._trace('_enactGovernment', [ now, round ])

    // While we still have the previous government we clear out any timed events
    // we might of set to fulfill out duties in the previous government. Note
    // that we are more discriminating when clearing out the ping records.
    this.citizens.forEach(function (id) { this.scheduler.unschedule(id) }, this)

    delete this.election
    this.collapsed = false

    assert(Monotonic.compare(this.government.promise, round.promise) < 0, 'governments out of order')

    this.government = JSON.parse(JSON.stringify(round.value))

    if (this.government.exile) {
        var index = this.government.constituents.indexOf(this.government.exile)
        this.government.constituents.splice(index, 1)
        // TODO Remove! Fall back to a peek at exile.
        delete this.government.properties[this.government.exile]
        delete this.pings[this.government.exile]
    }

    if (this.id != this.government.majority[0]) {
        this.proposals.length = 0
    }

// TODO Decide on whether this is calculated here or as needed.
    this.parliament = this.government.majority.concat(this.government.minority)

    this._determineConstituency()
    assert(!this.constituency.length || this.constituency[0] != null)
    this.scheduler.clear()
    if (this.government.majority[0] == this.id) {
        this.scheduler.schedule(now + this.ping, this.id, { object: this, method: '_whenKeepAlive' })
    } else if (~this.government.majority.slice(1).indexOf(this.id)) {
        this.scheduler.schedule(now + this.timeout, this.id, { object: this, method: '_whenCollapse' })
    }

    this.constituency.forEach(function (id) {
        this.scheduler.schedule(now, id, { object: this, method: '_whenPing' }, id)
    }, this)

    // Reset ping tracking information. Leader behavior is different from other
    // members. We clear out all ping information for ping who are not our
    // immediate constituents. This will keep us from hoarding stale ping
    // records. When everyone performs this cleaning, we can then trust
    // ourselves to return all ping information we've gathered to anyone that
    // pings us, knowing that it is all flowing from minority members to the
    // leader. We do not have to version the records, timestamp them, etc.
    //
    // If we didn't clear them out, then a stale record for a citizen can be
    // held onto by a majority member. If the minority member that pings the
    // citizen is no longer downstream from the majority member, that stale
    // record will not get updated, but it will be reported to the leader.
    //
    // We keep ping information if we are the leader, since it all flows back to
    // the leader. All leader information will soon be updated. Not resetting
    // the leader during normal operation makes adjustments to citizenship go
    // faster.
    this.citizens = this.government.majority
                        .concat(this.government.minority)
                        .concat(this.government.constituents)
    if (this.id == this.government.majority[0]) {
        for (var id in this.pings) {
            if (! ~this.citizens.indexOf(id)) {
                delete this.pings[id]
            }
        }
    } else {
        for (var id in this.pings) {
            if (this.id != id && ! ~this.constituency.indexOf(id)) {
                delete this.pings[id]
            }
        }
    }

    this._nudge(now)
}

Legislator.prototype._whenCollapse = function (now) {
    this._trace('_whenCollapse', [])
    this.collapse(now)
}

Legislator.prototype._naturalized = function (id) {
    var ping = this.pings[id] || {}
    return ping.naturalized && ping.timeout == 0
}

// TODO I don't believe I need to form a new government indicating that I've
// naturalized, merely record that I've been naturalized. It is a property that
// will return with liveness.
Legislator.prototype._expand = function () {
    this._trace('_expand', [])
    assert(!this.collapsed)
    var parliament = this.government.majority.concat(this.government.minority)
    if (parliament.length == this.parliamentSize) {
        return null
    }
    assert(~this.government.majority.indexOf(this.id), 'would be leader not in majority')
    // TODO This notion of reachable should include a test to ensure that the
    // minority is not so far behind that it cannot be caught up with the leader.
    var naturalized = parliament.slice(1).concat(this.government.constituents)
                                         .filter(this._naturalized.bind(this))
    var parliamentSize = Math.round(parliament.length / 2) * 2 + 1
    if (naturalized.length + 1 < parliamentSize) {
        return null
    }
    var majoritySize = Math.ceil(parliamentSize / 2)
    var growBy = 1
    if (parliament.length > 1) {
        // If we are a dictator, we can immediately grow to the next size
        // because no one else will compete with us in an election.
        if (this.government.majority.length < majoritySize) {
            return {
                // quorum: this.government.majority,
                quorum: parliament.slice(0, majoritySize),
                government: {
                    majority: parliament.slice(0, majoritySize),
                    minority: parliament.slice(majoritySize)
                }
            }
        }
    } else {
        growBy = 2
    }
    var newParliament = [ this.id ].concat(naturalized).slice(0, parliament.length + growBy)
    return {
        // quorum: this.government.majority,
        quorum: newParliament.slice(0, majoritySize),
        government: {
            majority: newParliament.slice(0, majoritySize),
            minority: newParliament.slice(majoritySize)
        }
    }
}

// Called after expand, so if we have a goverment that has lost a member of the
// minority, and was not able to replace it when it expanded, we know to kick
// another minority member so the goverment size will be at the next smalled odd
// number. Once there through shrink or impeachment, we'll see that the majority
// is too big and know that we can reshape the government to have a simple
// majority.
Legislator.prototype._shrink = function () {
    this._trace('_shrink', [])
    var parliament = this.government.majority.concat(this.government.minority)
    if (parliament.length == 1) {
        return null
    }
    if (parliament.length == 2) {
        return {
            quorum: this.government.majority,
            government: {
                majority: [ this.government.majority[0] ],
                minority: []
            }
        }
    }
    var parliamentSize = Math.floor(parliament.length / 2) * 2 + 1
    var majoritySize = Math.ceil(parliamentSize / 2)
    if (parliament.length % 2 == 0) {
        assert(this.government.majority.length == majoritySize)
        var minority = this.government.minority.slice()
        minority.pop()
        return {
            quorum: this.government.majority,
            government: {
                majority: this.government.majority.slice(),
                minority: minority
            }
        }
    }
    if (this.government.majority.length > majoritySize) {
        var majority = this.government.majority.slice()
        var minority = this.government.minority.slice()
        minority.push(majority.pop())
        return {
            quorum: this.government.majority,
            government: {
                majority: majority,
                minority: minority
            }
        }
    }
    assert(this.government.majority.length == majoritySize)
    return null
}

Legislator.prototype._timedout = function (id) {
    return this.pings[id] && this.pings[id].timeout >= this.timeout
}

Legislator.prototype._impeach = function () {
    this._trace('_impeach', [])
    assert(!this.collapsed)
    var timedout = this.government.minority.filter(this._timedout.bind(this))
    if (timedout.length == 0) {
        return null
    }
    var impeach = timedout.shift()
    var deducted = this.government.minority.filter(function (id) {
        return id != impeach
    })
    return {
        quorum: this.government.majority,
        government: {
            majority: this.government.majority,
            minority: deducted
        }
    }
}

Legislator.prototype._exile = function () {
    this._trace('_exile', [])
    assert(!this.collapsed)
    var responsive = this.government.constituents.filter(function (id) {
        return !this.pings[id] || this.pings[id].timeout < this.timeout
    }.bind(this))
    if (responsive.length == this.government.constituents.length) {
        return null
    }
    var exiles = this.government.constituents.filter(function (id) {
        return this.pings[id] && this.pings[id].timeout >= this.timeout
    }.bind(this))
    return {
        quorum: this.government.majority,
        government: {
            majority: this.government.majority,
            minority: this.government.minority,
            exile: exiles.shift()
        }
    }
}

module.exports = Legislator
