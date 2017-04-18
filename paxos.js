// Common utilities.
var assert = require('assert')

// Ever increasing serial value with no maximum value.
var Monotonic = require('monotonic').asString

// A timer with named, cancelable events.
var Scheduler = require('happenstance').Scheduler

// An evented message queue used for the atomic log.
var Procession = require('procession')

// A sorted index into the atomic log. TODO Must it be a tree?
var Indexer = require('procession/indexer')

// Logging conduit.
var logger = require('prolific.logger').createLogger('paxos')

function Paxos (id, options) {
    assert(arguments.length == 2, 'only two arguments now')

    this.id = String(id)
    this.naturalized = !! options.naturalized

    this.parliamentSize = options.parliamentSize || 5

    this.log = new Procession
    this.log.addListener(this.indexer = new Indexer(function (left, right) {
        assert(left && right)
        assert(left.body && right.body)
        return Monotonic.compare(left.body.promise, right.body.promise)
    }))
    this.scheduler = new Scheduler
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

    this.constituency = []
    this.operations = []
    this.citizens = []
    this.minimum = '0/0'

    this.outbox = new Procession

    this.least = this.log.shifter()

    // TODO So, does it matter if the user nevers sees `0/0`?
    this.log.push({
        module: 'paxos',
        promise: '0/0',
        body: this.government
    })
}

Paxos.prototype.getPing = function (id) {
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
Paxos.prototype.newGovernment = function (now, quorum, government, promise) {
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
        var immigrate = government.immigrate
        properties[immigrate.id] = JSON.parse(JSON.stringify(government.immigrate.properties))
        if (promise == '1/0') {
            government.majority.push(immigrate.id)
        } else {
            government.constituents.push(immigrate.id)
        }
        immigrated.promise[immigrate.id] = promise
        immigrated.id[promise] = immigrate.id
    } else if (government.exile) {
        var exile = government.exile
        exile.promise = immigrated.promise[exile.id]
        exile.properties = properties[exile.id]
        delete immigrated.promise[exile.id]
        delete immigrated.id[exile.promise]
        delete properties[exile.id]
        government.constituents.splice(government.constituents.indexOf(exile.id), 1)
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
        body: government
    })
}

// TODO When we collapse, let's change our constituency to our parliament,
// except ourselves, to ensure that we're pinging away and waiting for a
// consensus to form. Wait, we're already doing that.
//
// TODO Okay, so let's create our constituency tree, so we know how to propagate
// messages back to the leader.
Paxos.prototype._gatherProposals = function (now) {
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
        republic: this.republic,
        governments: [ this.government.promise ],
        route: majority,
        messages: [{
            type: 'propose',
            // Do not increment here, it will be set by `_receivePromise`.
            promise: Monotonic.increment(this.promise, 0)
        }]
    }
}

Paxos.prototype._advanceElection = function (now) {
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
            republic: this.republic,
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

Paxos.prototype._twoPhaseCommit = function (now) {
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
//
// Me later: Actually, putting the government at the head of the queue means
// at this point is used to keep government calculations simple. I suppose e can
// run those caculations after every change and put it at the end of the queue,
// but what confuses me is more than one govermental change in the queue.
//
// Therefore, if we only ever have one government in the queue, it doesn't save
// use a world of complexity to `unshift` it instead of `push` it.
    if (this.accepted && Monotonic.isBoundary(this.accepted.promise, 0)) {
        return {
            type: 'consensus',
            republic: this.republic,
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
                republic: this.republic,
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

// This nested if bothers me. Start to imagine how to employ the GoF strategy
// pattern. Might be happy enough if it where a state flag with a `switch`
// statemenet. Do not like all the flags and feeling around in the dark for a
// state. Yet, the `collapsed` flag is used to shut off enqueuing and adjust the
// nature of the algorithm to be Paxos proper and not two-phase commit, so the
// strategy pattern is the best approach because then those flags can be a
// proeprty of the pattern.

//
Paxos.prototype._consensus = function (now) {
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
Paxos.prototype._findRound = function (sought) {
    return this.indexer.tree.find({ body: { promise: sought } })
}

// TODO Sending all of the backloged entries at once, which ought to be okay
// since it will be to members of our synod and not too far behind. If they
// where, we'd have removed them from the government. Still, it would be nice to
// send these in batches and assert that everyone shares the same max decided
// promise.

//
Paxos.prototype._stuffProposal = function (messages, proposal) {
    messages.push({
        type: 'minimum',
        promise: this.minimum
    })
    // TODO We still have a problem here. If the recipient is not up to date we
    // will send an enactment in the pulse and we will receive the enactment
    // ourslelves, causing us to reset our election.
    //
    // Also, we don't want to push here, we want to reduce to the minimum.
    var route = proposal.route == null ? this.government.majority.slice() : proposal.route.slice()
    route.slice(1).forEach(function (id) {
        var ping = this.getPing(id)
        assert(ping.pinged)
        this._pushEnactments(messages, this._findRound(ping.decided).next, -1)
    }, this)
    var previous = this.collapsed ? this.accepted : null
    messages.push({
        type: 'accept',
        promise: proposal.promise,
        body: proposal.body,
        previous: previous
    })
    return {
        type: 'consensus',
        republic: this.republic,
        governments: [ this.government.promise ],
        route: route,
        messages: messages
    }
}

Paxos.prototype._nudge = function (now) {
    assert(now != null)
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

Paxos.prototype._stuffSynchronize = function (now, ping, messages) {
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
                if (Monotonic.isBoundary(iterator.body.promise, 0)) {
                    var immigrate = iterator.body.body.immigrate
                    if (immigrate && immigrate.id == ping.id) {
                        break
                    }
                }
                iterator = iterator.next
            }
        } else {
            messages.push({
                type: 'minimum',
                promise: this.minimum
            })

            // If our minimum promise is greated than the most decided promise
            // for the contituent then our ping record for the constituent is
            // out of date.
            if (Monotonic.compare(ping.decided, this.minimum) < 0) {
                return true
            }

// TODO Got a read property of null here.
            iterator = this._findRound(ping.decided).next
        }

        this._pushEnactments(messages, iterator, 20)
    }
    return true
}

Paxos.prototype._pushEnactments = function (messages, iterator, count) {
    while (--count && iterator != null) {
        messages.push({
            type: 'enact',
            promise: iterator.body.promise,
            body: iterator.body.body
        })
        iterator = iterator.next
    }
}

Paxos.prototype.receive = function (now, pulse, messages) {
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

Paxos.prototype.collapse = function (now) {
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
            module: 'paxos',
            method: 'ping',
            body: null
        })
    }, this)
}

Paxos.prototype.sent = function (now, pulse, responses) {
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
                module: 'paxos',
                method: 'ping',
                body: { id: pulse.route[0] }
            })
            break
        case 'consensus':
            // TODO Do I set keep alive when we've collapsed? `&& !this.collapse`
            if (!this._nudge(now)) {
                this.scheduler.schedule(now + this.ping, this.id, {
                    module: 'paxos',
                    method: 'keepAlive',
                    body: null
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
            this.getPing(this.id).decided = this.log.head.body.promise
            this.minimum = this.citizens.reduce(function (minimum, citizen) {
                if (minimum == null) {
                    return null
                }
                var ping = this.getPing(citizen)
                if (!ping.pinged) {
                    return null
                }
                return Monotonic.compare(ping.decided, minimum) < 0 ? ping.decided : minimum
            }.bind(this), this.pings[this.id].decided) || this.minimum
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
                module: 'paxos',
                method: 'ping',
                body: { id: pulse.route[0] }
            })
            break
        }
    }
}

Paxos.prototype.event = function (envelope) {
    if (envelope.module != 'happenstance' || envelope.method != 'event') {
        return
    }
    var now = envelope.now
    switch (envelope.body.method) {
    case 'ping':
        this._whenPing(envelope.now, envelope.key)
        break
    case 'keepAlive':
        this._whenKeepAlive(envelope.now)
        break
    case 'collapse':
        this._whenCollapse(envelope.now)
        break
    }
}

Paxos.prototype.bootstrap = function (now, republic, properties) {
    // Update current state as if we're already leader.
    this.naturalize()
    this.republic = republic
    this.government.majority.push(this.id)
    this.newGovernment(now, [ this.id ], {
        majority: [],
        minority: [],
        immigrate: {
            id: this.id,
            properties: properties,
            cookie: null
        }
    }, '1/0')
    this._nudge(now)
}

// TODO At this moment, Kibitz and Paxos disagree on how to attempt to join an
// island. Kibitz has it wrong. It will call this method multiple times, but
// that is going to push multiple `0/0` entries into the log. However, we can
// see that the initial entry is pushed on as the first step of both `bootstrap`
// and `join` so there's no reason why it cannot be part of the constructor.
//
// Which means that this can be called multpile times. It can even be reset,
// maybe.

//
Paxos.prototype.join = function (cookie, republic) {
    this.cookie = cookie
    this.republic = republic
}

Paxos.prototype.naturalize = function () {
    this.naturalized = true
}

// TODO Is all this checking necessary? Is it necessary to return the island id
// and leader? This imagines that the client is going to do the retry, but in
// reality we often have the cluster performt the retry. The client needs to
// talk to a server that can be discovered, it can't use the Paxos algorithm for
// address resolution. From the suggested logic, it will only have a single
// address, and maybe be told of an actual leader. What happens when that
// address is lost? Don't see where returning `republic` and leader helps at
// all. It is enough to say you failed, backoff and try again. The network layer
// can perform checks to see if the recepient is the leader and hop to the
// actual leader if it isn't, reject if it is but collapsed.
//
// Once you've externalized this in kibitz, remove it, or pare it down.
Paxos.prototype._enqueuable = function (republic) {
    if (this.collapsed || this.republic != republic) {
        return {
            enqueued: false,
            republic: this.republic,
            leader: null
        }
    }
    if (this.government.majority[0] != this.id) {
        return {
            enqueued: false,
            republic: this.republic,
            leader: this.government.majority[0]
        }
    }
}

// Note that a client will have to treat a network failure on submission as a
// failure requiring boundary detection.
Paxos.prototype.enqueue = function (now, republic, message) {

    var response = this._enqueuable(republic)
    if (response == null) {
// TODO Bombs out the current working promise.
        // TODO Note that we used to snapshot the majority here as the route but
        // that can change. Note that the last issued promise is not driven by
        // government enactment, it is incremented as we greate new promises and
        // governments.
        var promise = this.lastIssued = Monotonic.increment(this.lastIssued, 1)
        this.proposals.push({
            promise: promise,
            route: null,
            //route: this.government.majority,
            body: message
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

Paxos.prototype.immigrate = function (now, republic, id, cookie, properties) {
    assert(typeof id == 'string', 'id must be a hexidecmimal string')
    var response = this._enqueuable(republic)
    if (response == null) {
// TODO This is a note. I'd like to find a place to journal this. I'm continuing
// to take measures to allow for the reuse of ids. It still feels right to me
// that a display of government or of the census would be displayed using values
// meaningful to our dear user; Kubernetes HOSTNAMES, AWS instance names, IP
// address, and not something that is garunteed unique like a UUID, because such
// things are indistinguishable to the human observer.
//
// Yet, here I am again contending with an issue that would be so simple if ids
// where required to be unique. When a citizen that is a constituent dies and
// restarts with the same id it will be pinged by someone in government, it will
// report that it's empty, and its representative will look for it's immigration
// record. There's a race now. Is the new instance going to immigrate before its
// pinged? Or is the representative going to search for an immigration record
// and not find one, which causes us to abend at the moment?
//
// When we get a sync before immigration, it will not see a cookie or not see
// the right cookie and fail the sync. These syncs fail, time passes, the time
// out comes and the record is cleared. That takes care of the race when the
// sync beats the immigration record, but what if the immigration record beats
// the representative?
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
                republic: this.republic,
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

Paxos.prototype._reject = function (message) {
    return {
        type: 'reject',
        from: this.id,
        government: this.government.pulse,
        promised: this.promise
    }
}

Paxos.prototype._receiveReject = function (now, pulse, message) {
    pulse.failed = true
}

Paxos.prototype._receivePropose = function (now, pulse, message, responses) {
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

Paxos.prototype._receivePromise = function (now, pulse, message, responses) {
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

Paxos.prototype._rejected = function (pulse, comparator) {
    if (pulse.republic != this.republic) {
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

Paxos.prototype._receiveAccept = function (now, pulse, message, responses) {
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

Paxos.prototype._receiveAccepted = function (now, pulse, message) {
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
Paxos.prototype._receiveCommit = function (now, pulse, message, responses) {
    logger.info('_receiveCommit', {
        now: now, $route: pulse.route, $message: message, $accepted: this.accepted
    })
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
    logger.info('_receivedCommit', {
        now: now, $route: pulse.route, $message: message
    })
}

Paxos.prototype._receiveEnact = function (now, pulse, message) {
    message = JSON.parse(JSON.stringify(message))
    logger.info('_receiveEnact', { now: now, $route: pulse.route, $message: message })

    var max = this.log.head.body

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

    // Okay, we're not always going to get just the entries we're missing. An
    // election can seek to bring a minority member up to date by pushing it an
    // enactment before a proposal. The message bundle will be received by all
    // members of the proposed government, including the leader that is doing
    // the pushing, so it's log will have, of course, already enacted the
    // member -- it pulled the enactment of of it's own log after all.

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
        valid = valid && message.body.immigrate
        valid = valid && message.body.immigrate.id == this.id
        valid = valid && message.body.immigrate.cookie == this.cookie
    }
    if (!valid) {
        pulse.failed = true
        return
    }

    this.proposal = null
    this.accepted = null
    this.collapsed = false
    this.election = false

    var isGovernment = Monotonic.isBoundary(message.promise, 0)
    logger.info('enact', {
        outOfOrder: !(isGovernment || Monotonic.increment(max.promise, 1) == message.promise),
        isGovernment: isGovernment,
        previous: max.promise,
        next: message.promise
    })

// TODO How crufy are these log entries? What else is lying around in them?
    max.next = message
    message.previous = max.promise
// Forever bombing out our latest promise.
    this.promise = message.promise

    if (isGovernment) {
        this._enactGovernment(now, message)
    }

    this.getPing(this.id).decided = message.promise

    this.log.push({
        module: 'paxos',
        method: isGovernment ? 'government' : 'entry',
        promise: message.promise,
        previous: max.promise,
        body: message.body
    })

    this.constituency.forEach(function (id) {
        this.scheduler.schedule(now, id, { module: 'paxos', method: 'ping', body: null })
    }, this)
}

Paxos.prototype._ping = function (now) {
    return { type: 'ping', from: this.id, collapsed: this.collapsed }
}

Paxos.prototype._pong = function (now) {
    return {
        type: 'pong',
        from: this.id,
        timeout: 0,
        when: now,
        naturalized: this.naturalized,
        decided: this.pings[this.id].decided
    }
}

Paxos.prototype._whenKeepAlive = function (now) {
    this.outbox.push({
        type: 'consensus',
        republic: this.republic,
        governments: [ this.government.promise ],
        route: this.government.majority,
        messages: [ this._ping(now) ]
    })
}

Paxos.prototype._whenPing = function (now, id) {
    var ping = this.getPing(id)
    if (ping.timeout == 0) {
        ping.timeout = 1
    }
    var compare = Monotonic.compare(this.getPing(id).decided, this.getPing(this.id).decided)
    var messages = []
    var pulse = {
        type: 'synchronize',
        republic: this.republic,
        governments: [ this.government.promise ],
        route: [ id ],
        messages: messages,
        failed: ! this._stuffSynchronize(now, ping, messages)
    }
    pulse.messages.push(this._pong(now))
    pulse.messages.push(this._ping(now))
    this.outbox.push(pulse)
}

Paxos.prototype._receivePong = function (now, pulse, message, responses) {
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

Paxos.prototype._receiveMinimum = function (now, pulse, message) {
    while (Monotonic.compare(this.least.peek().promise, message.promise) < 0) {
        this.least.shift()
    }
    if (Monotonic.compare(this.minimum, message.promise) < 0) {
        this.minimum = message.promise
    }
}

Paxos.prototype._receivePing = function (now, pulse, message, responses) {
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
            module: 'paxos',
            method: 'collapse',
            body: null
        })
    }
}

// Majority updates minority. Minority updates constituents. If there is
// no minority, then the majority updates constituents.

//
Paxos.prototype._determineConstituency = function () {
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

Paxos.prototype._enactGovernment = function (now, round) {
    // While we still have the previous government we clear out any timed events
    // we might of set to fulfill out duties in the previous government. Note
    // that we are more discriminating when clearing out the ping records.
    this.citizens.forEach(function (id) { this.scheduler.unschedule(id) }, this)

    delete this.election
    this.collapsed = false

    assert(Monotonic.compare(this.government.promise, round.promise) < 0, 'governments out of order')

    this.government = JSON.parse(JSON.stringify(round.body))

    if (this.government.exile) {
        // TODO Remove! Fall back to a peek at exile.
        delete this.pings[this.government.exile.id]
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
        this.scheduler.schedule(now + this.ping, this.id, {
            module: 'paxos',
            method: 'keepAlive',
            body: null
        })
    } else if (~this.government.majority.slice(1).indexOf(this.id)) {
        this.scheduler.schedule(now + this.timeout, this.id, {
            module: 'paxos',
            method: 'collapse',
            body: null
        })
    }

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

Paxos.prototype._whenCollapse = function (now) {
    this.collapse(now)
}

Paxos.prototype._naturalized = function (id) {
    var ping = this.pings[id] || {}
    return ping.naturalized && ping.timeout == 0
}

// TODO I don't believe I need to form a new government indicating that I've
// naturalized, merely record that I've been naturalized. It is a property that
// will return with liveness.
Paxos.prototype._expand = function () {
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
Paxos.prototype._shrink = function () {
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

Paxos.prototype._timedout = function (id) {
    return this.pings[id] && this.pings[id].timeout >= this.timeout
}

Paxos.prototype._impeach = function () {
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

Paxos.prototype._exile = function () {
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
            exile: { id: exiles.shift() }
        }
    }
}

module.exports = Paxos
