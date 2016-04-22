var assert = require('assert')
var Monotonic = require('monotonic').asString
var Scheduler = require('happenstance')
var push = [].push
var slice = [].slice
var RBTree = require('bintrees').RBTree
var signal = require('signal')

function Legislator (now, id, options) {
    assert(typeof now == 'number')

    options || (options = {})

    assert(typeof id == 'string', 'id must be hexidecimal string')

    this.id = id
    this.parliamentSize = options.parliamentSize || 5
    this._Date = options.Date || Date

    this.log = new RBTree(function (a, b) { return Monotonic.compare(a.promise, b.promise) })
    this.scheduler = new Scheduler
    this.synchronizing = {}

    this.proposals = []
    this.locations = {}
    this.pulse = null
    this.naturalizing = []
    this._dirty = false

    this.government = { promise: '0/0', minority: [], majority: [] }
    this.promise = '0/0'
    this.citizens = []

    this._peers = {}
    this.getPeer(this.id).extant = true
    this.getPeer(this.id).timeout = 0

    this.length = options.length || 1024

    assert(!Array.isArray(options.retry), 'retry no longer accepts range')
    assert(!Array.isArray(options.ping), 'retry no longer accepts range')
    assert(!Array.isArray(options.timeout), 'retry no longer accepts range')

    this.ticks = {}
    this.ping = options.ping || 1
    this.timeout = options.timeout || 1
    this.proposing = false

    var round = {
        promise: '0/0',
        value: { government: this.government },
        quorum: [ this.id ],
        decisions: [ this.id ],
        decided: true,
        enacted: true
    }
    this.log.insert(round)

    this._propagation(now)
}

Legislator.prototype._signal = function (method, vargs) {
    var subscribers = signal.subscribers([ '', 'bigeasy', 'paxos', 'invoke' ])
    for (var i = 0, I = subscribers.length; i < I; i++) {
        subscribers[i](this.id, method, vargs)
    }
}

Legislator.prototype._maybeReshape = function (now) {
    if (this.proposing) {
        return false
    }
    if (this._dirty) {
        var reshape = this._dirty && this._ponged()
        if (reshape) {
            this._dirty = false
            this.newGovernment(now, reshape.quorum, reshape.government, false)
            return true
        }
    }
    return false
}

Legislator.prototype._synchronizePulse = function (id) {
    this.synchronizing[id] = true
    return {
        type: 'synchronize',
        route: [ this.id, id ],
        incoming: [{
            to: this.id,
            from: id,
            message: { type: 'synchronize', to: id, count: 20 }
        }],
        outgoing: []
    }
}
Legislator.prototype.outbox = function (now) {
    // TODO Terrible. Reset naturalizing on collapse.
    if (this.naturalizing.length && this.government.majority[0] == this.id) {
        // TODO Is there a race condition associated with leaving
        // this in place? We need to break things pretty hard in a
        // contentinous election.
        var naturalization = this.naturalizing.shift()
        this.newGovernment(now, this.government.majority, {
            majority: this.government.majority,
            minority: this.government.minority,
            naturalize: {
                id: naturalization.id,
                location: naturalization.location
            }
        }, true)
    } else if (!this.collapsed) {
        // TODO Special pulse on government change; need to
        // propagate changes to new majority members.
        // TODO Most interesting case is a change in the shape of
        // the government that enters the collapsed state.
        if (! this._maybeReshape(now) && this.proposals.length && !this.proposing) {
            this._propose(now, decided)
        }
    }
    var outbox = []
    if (this.pulse != null) {
        outbox.push(this.pulse)
        this.pulse = null
    }
    if (this.collapsed) { // and the pulse is not a government
        this.parliament.filter(function (id) {
            return id != this.id
        }.bind(this)).forEach(function (id) {
            if (!this.synchronizing[id]) {
                outbox.push(this._synchronizePulse(id))
            }
        }, this)
    } else {
        for (var i = 0, I = this.constituency.length; i < I; i++) {
            var id = this.constituency[i]
            var peer = this.getPeer(id)
            var compare = Monotonic.compare(this.getPeer(id).enacted, this.getPeer(this.id).enacted)
            if ((compare < 0 || peer.outdated) && !this.synchronizing[id]) {
                outbox.push(this._synchronizePulse(id))
            }
        }
    }
    return outbox
}

Legislator.prototype.getPeer = function (id, initializer) {
    var peer = this._peers[id]
    if (peer == null) {
        peer = this._peers[id] = {
            extant: false,
            timeout: 1,
            when: 0,
            decided: '0/0',
            enacted: '0/0'
        }
    }
    initializer || (initializer = {})
    for (var key in initializer) {
        peer[key] = initializer[key]
    }
    return peer
}

// TODO To make replayable, we need to create a scheduler that accepts a now so
// that the caller can replay the schedule, this should probably be the default.
Legislator.prototype._schedule = function (now, event) {
    assert(arguments.length == 2)
    return this.scheduler.schedule(event.id, event, now + event.delay)
}

Legislator.prototype._unschedule = function (id) {
    this._signal('_unschedule', [ id ])
    this.scheduler.unschedule(id)
}

Legislator.prototype.checkSchedule = function (now) {
    this._signal('checkSchedule', [ now ])
    var happened = false
    this.scheduler.check(now).forEach(function (event) {
        happened = true
        var type = event.type
        var method = '_when' + type[0].toUpperCase() + type.substring(1)
        this[method](event)
    }, this)
    return happened
}

Legislator.prototype.consume = function (now, pulse) {
    assert(arguments.length == 2 && now != null)
    this._signal('_consume', [ now, pulse ])
    var consumed = true
    while (consumed) {
        consumed = false
        pulse.incoming.push.apply(pulse.incoming, pulse.outgoing.splice(0, pulse.outgoing.length))
        pulse.incoming = pulse.incoming.filter(function (envelope) {
            if (envelope.to == this.id) {
                var type = envelope.message.type
                var method = '_receive' + type[0].toUpperCase() + type.substring(1)
                this.ticks[envelope.from] = now
                this[method].call(this, now, pulse, envelope, envelope.message)
                consumed = true
                return false
            }
            return true
        }.bind(this))
    }
}

Legislator.prototype._stuff = function (now, pulse, options) {
    this._signal('_stuff', [ now, pulse, options ])
    assert(arguments.length == 3 && now != null)
    var from = options.from || [ this.id ]
    from.forEach(function (from) {
        options.to.forEach(function (to) {
            pulse.outgoing.push({
                from: from,
                to: to,
                message: options.message
            })
        })
    })
}

Legislator.prototype.sent = function (now, pulse, success) {
    this._signal('sent', [ pulse ])
    if (success) {
        pulse.route.slice(1).forEach(function (id) {
            this.getPeer(id, { timeout: 0, now: now })
        }, this)
        switch (pulse.type) {
        case 'synchronize':
            this.synchronizing[pulse.route[1]] = false
            this._schedule(now, { type: 'ping', id: pulse.route[1], delay: this.ping })
            break
        case 'consensus':
            this._schedule(now, { type: 'pulse', id: this.id, delay: this.ping })
            break
        }
    } else {
        switch (pulse.type) {
        case 'consensus':
            this.collapse()
            break
        case 'synchronize':
            this.synchronizing[pulse.route[1]] = false
            this.getPeer(pulse.route[1], { extant: true })
            this._dirty = true
            this._schedule(now, { type: 'ping', id: pulse.route[1], delay: this.ping })
            break
        }
    }
}

Legislator.prototype.collapse = function () {
    this.collapsed = true
    for (var id in this._peers) {
        if (id != this.id) {
            delete this._peers[key]
        }
    }
}

Legislator.prototype.bootstrap = function (now, location) {
    this._signal('bootstrap', [ now, location ])
    var government = {
        majority: [ this.id ],
        minority: []
    }
    this.locations[this.id] = location
    this.citizens = [ this.id ]
    this.newGovernment(now, [ this.id ], government, false)
}

Legislator.prototype.newGovernment = function (now, quorum, government, remap) {
    assert(arguments.length == 4)
    // TODO Need a copy government befor sharing it in this way.
    this._signal('newGovernment', [ quorum, government, remap ])
    assert(!government.constituents)
    government.constituents = this.citizens.filter(function (citizen) {
        return !~government.majority.indexOf(citizen)
            && !~government.minority.indexOf(citizen)
    })
    var promise = government.promise = this.promise = Monotonic.increment(this.promise, 0)
    var map = []
    if (remap) {
        this.proposals = this.proposals.splice(0, this.proposals.length).map(function (proposal) {
            proposal.was = proposal.promise
            proposal.promise = this.promise = Monotonic.increment(this.promise, 1)
            return proposal
        }.bind(this))
        map = this.proposals.map(function (proposal) {
            return { was: proposal.was, is: proposal.promise }
        })
    } else {
        this.proposals.length = 0
    }
    var messages = []
    quorum.slice(1).forEach(function (id) {
        messages.push({
            to: [ this.id ],
            message: { type: 'synchronize', to: id, count: 20 }
        })
    }, this)
    messages.push({
        to: quorum,
        message: {
            type: 'propose',
            promise: promise,
            quorum: quorum,
            acceptances: [],
            decisions: [],
            cookie: null,
            internal: true,
            value: {
                type: 'government',
                government: government,
                terminus: JSON.parse(JSON.stringify(this.log.max())),
                locations: this.locations,
                map: map
            }
        }
    })
    this.proposals.unshift({
        type: 'election',
        quorum: quorum,
        messages: messages
    })
    if (!this.proposing) {
        this._propose(now)
    }
}

// TODO We might get something enqueued and not know it. There are two ways to
// deal with this; we have some mechanism that prevents the double submission of
// a cookie, so that the client can put something into the queue, and have a
// mechanism to say, you who's id is such and such, you're last cookie was this
// value. You can only post the next cookie if the previous cookie is correct.
// This cookie list can be maintained by the log.

// Otherwise, it has to be no big deal to repeat something. Add a user, get a
// 500, so add it again with a new cookie, same cookie, you sort it out when two
// "add user" messages come back to you.

// This queue, it could be maintained by the server, with the last value that
// passed through Paxos in a look up table, a list of submissions waiting to be
// added, so a link to the next submission in the queue. The user can know that
// if the government jitters, they can know definitively what they need to
// resubmit.

// Or else, if they get a 500, they resubmit, resubmit, resubmit until they get
// a 200, but the clients know not to replay duplicate cookies, that becomes
// logic for the client queue, or in the application, user added using such and
// such a promise, such and such a cookie, so this has already been updated.

// Finally, a 500 message, it can be followed by a boundary message, basically,
// you put in a message it may not have been enqueued, you're not told
// definitively that it was, so you put in a boundary, noop message, and you
// wait for it to emerge in the log, so that if it emerges without you're seeing
// your actual message, then you then know for certain to resubmit. This fits
// with what's currently going on, and it means that the clients can conspire to
// build a perfect event log.

// TODO: Actually, this order that you guarantee, that's not part of Paxos,
// really.
Legislator.prototype.post = function (now, cookie, value, internal) {
    this._signal('post', [ now, cookie, value, internal ])
    if (this.government.majority[0] != this.id) {
        return {
            posted: false,
            leader: this.government.majority[0]
        }
    }

    var max = this.log.max()
    if ((!max.decided && Monotonic.isBoundary(max.id, 0)) || this.election) {
        return {
            posted: false,
            leader: null
        }
    }

    if (internal && value.type == 'naturalize') {
        this.naturalizing.push({ id: value.id, location: value.location })
        return { posted: true, promise: null }
    }

    var promise = this.promise = Monotonic.increment(this.promise, 1)
    this.proposals.push({
        type: 'consensus',
        quorum: this.government.majority,
        messages: [{
            to: this.government.majority,
            message: {
                type: 'propose',
                promise: promise,
                quorum: this.government.majority,
                acceptances: [],
                decisions: [],
                cookie: cookie,
                internal: internal,
                value: value
            }
        }]
    })

    // TODO What is the best way to know if the ball is rolling?
    // TODO No good. `_propose` does not put a message on the end of the log.
    if (!this.proposing) {
        this._propose(now)
    }

    return {
        posted: true,
        leader: this.government.majority[0],
        promise: promise
    }
}

Legislator.prototype._propose = function (now) {
    this._signal('_propose', [])
    assert(!this.proposing, 'already proposing')
    this.proposing = true
    var proposal = this.proposals.shift()
    if (this.pulse == null) {
        this.pulse = {
            type: 'consensus',
            route: proposal.quorum,
            incoming: [],
            outgoing: []
        }
    }
    proposal.messages.forEach(function (message) {
        this._stuff(now, this.pulse, message)
    }, this)
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

Legislator.prototype._receivePropose = function (now, pulse, envelope, message) {
    // fetch an interator to inspect the last two entries in the log
    var iterator = this.log.iterator()
    var max = iterator.prev()

    var accepted = false

    // if not already proposed by someone else, and greater than or inside the
    // current government...
    var message = envelope.message
    var round = this.log.find({ promise: message.promise })
    var compare = Monotonic.compareIndex(max.promise, message.promise, 0)
    if (!round && compare <= 0) {
        accepted = true
        if (compare < 0) {
            // select the last decided entry in the log
            var decided = max.decided ? max : iterator.prev()
            var terminus = message.value.terminus
            // the terminus must be in the previous government
            accepted = Monotonic.compareIndex(terminus.promise, decided.promise, 0) == 0
            // TODO There needs to be a message that says that a new citizen is
            // a member of society, that they are receiving messages.
            if (!accepted) {
                accepted = this.log.size == 1
                accepted = accepted && this.log.min().promise == '0/0'
                accepted = accepted && message.value.government.naturalize
                accepted = accepted && message.value.government.naturalize.id == this.id
            }
            if (accepted) {
                // remove the top of the log if it is undecided, we're replacing it.
                if (!max.decided) {
                    this.log.remove(max)
                }
            }
        }
    }
    if (accepted) {
        this.log.insert(message)
        if (~message.quorum.indexOf(this.id)) {
            this._stuff(now, pulse, {
                to: message.quorum,
                message: {
                    type: 'accepted',
                    promise: message.promise,
                    quorum: message.quorum
                }
            })
        }
    } else if (~message.quorum.indexOf(this.id)) {
        console.log(max.promise, message)
        throw new Error
        this._stuff(now, pulse, {
            to: message.quorum,
            message: {
                type: 'rejected',
                promise: message.promise
            }
        })
    }
}

// TODO Do not learn something if the promise is less than your uniform id.
Legislator.prototype._receiveAccepted = function (now, pulse, envelope, message) {
    assert(now != null)
    var message = envelope.message
    var round = this.log.find({ promise: message.promise })
    if (envelope.from == '1') {
        debugger
    }
    assert(~round.quorum.indexOf(envelope.from))
    if (!~round.acceptances.indexOf(envelope.from)) {
        round.acceptances.push(envelope.from)
        if (!round.decided && round.acceptances.length >= round.quorum.length)  {
            this._peers[this.id].decided = round.promise
            round.decided = true
            this._stuff(now, pulse, {
                to: round.quorum,
                message: {
                    type: 'decided',
                    promise: round.promise
                }
            })
        }
    }
}

Legislator.prototype._receiveRejected = function (envelope, message) {
    var entry = this._entry(message.promise, message)
    assert(!~entry.accepts.indexOf(envelope.from))
    assert(~entry.quorum.indexOf(this.id))
    assert(~entry.quorum.indexOf(envelope.from))
    entry.rejects || (entry.rejects = [])
    entry.rejects.push(envelope.from)
}

Legislator.prototype._receiveDecided = function (now, pulse, envelope, message) {
    this._signal('_receiveDecided', [ now, pulse, envelope ])
    var iterator = this.log.iterator()
    var round = iterator.prev()
    if (Monotonic.compare(round.promise, message.promise) == 0 &&
        !~round.decisions.indexOf(envelope.from)
    ) {
        round.decisions.push(envelope.from)
        if (round.decisions.length == round.quorum.length) {
            iterator.prev().next = round
            round.enacted = true
            while (this.log.size > this.length) {
                this.log.remove(this.log.min())
            }
            this._peers[this.id].enacted = round.promise
            if (Monotonic.isBoundary(message.promise, 0)) {
                this._enactGovernment(now, round)
            }
            if (this.government.majority[0] == this.id) {
                this.proposing = false
                this.pulse = pulse
                this._stuff(now, pulse, {
                    to: this.government.majority.slice(1),
                    message: {
                        type: 'decided',
                        promise: message.promise
                    }
                })
            }
        }
    }
}

// This merely asserts that a message follows a certain route. Maybe I'll
// rename it to "route", but "nothing" is good enough.
Legislator.prototype.__nothing = function (now, messages) {
    this._signal('_nothing', [ now, messages ])
    this._dispatch(now, 'consensus', this.government.majority, messages.concat({
        to: this.government.majority.slice(1),
        message: this._ping(now)
    }))
}

// This is a message because it rides the pulse. When a new government is
// created, the new leader adds `"synchronize"` messages to the `"prepare"`
// messages. It is opportune to have the leader signal that the new majority
// needs to synchronize amongst themselves and have that knowledge ride the
// initial pulse that runs a full round of Paxos.
//
// This is is noteworthy because you've come back to this code, looked at how
// the message is used to synchronize constituents and thought that it was a
// waste to tigger these actions through dispatch. You then look at how the
// messages are sent during the pulse and wonder why those messages can't simply
// be added by a function call, but the pulse is telling all the members of the
// majority to synchronize among themselves.
//
// However, it is always going to be the case that when we are reelecting we're
// going to synchronize from the new leader. The new leader is going to be a
// member of the previous majority. They are going to have the latest
// information. And, actually, we can always check when we see a route if the
// members on that route are at the same level of uniformity as us.

// TODO Allow messages to land prior to being primed. No! Assert that this never
// happens.
Legislator.prototype._receiveSynchronize = function (now, pulse, envelope, message) {
    var peer = this.getPeer(message.to), maximum = peer.enacted

    if (peer.extant) {
        var round
        if (peer.enacted == '0/0') {
            round = this.log.min()
            assert(Monotonic.compareIndex(round.promise, '0/0', 1) == 0, 'minimum not a government')
            for (;;) {
                var naturalize = round.value.government.naturalize
                if (naturalize && naturalize.id == message.to) {
                    maximum = round.promise
                    break
                }
                round = round.nextGovernment
                assert(round, 'cannot find naturalization')
            }
        } else {
            round = this.log.find({ promise: maximum }).next
        }

        var count = message.count
        assert(count, 'zero count to synchronize')

        while (--count && round) {
            this._replicate(now, pulse, message.to, round)
            round = round.next
        }

        // Decided will only be sent by a majority member during re-election. There
        // will always be zero or one decided rounds in addition to the existing
        // rounds.
        if (pulse.type != 'synchronize' &&
            this._peers[this.id].decided != this._peers[message.to].decided
        ) {
            throw new Error
            this._replicate(now, pulse, message.to, this.log.find({ id: this._greatestOf(this.id).decided }))
        }
    }

    this._stuff(now, pulse, {
        to: [ message.to ],
        message: this._ping(now)
    })
}

Legislator.prototype._ping = function (now) {
    return {
        type: 'ping',
        when: now,
        decided: this._peers[this.id].decided,
        enacted: this._peers[this.id].enacted
    }
}

Legislator.prototype._replicate = function (now, pulse, to, round) {
    this._stuff(now, pulse, {
        from: round.quorum,
        to: [ to ],
        message: {
            type: 'propose',
            promise: round.promise,
            quorum: round.quorum,
            acceptances: [],
            decisions: [],
            cookie: round.cookie,
            internal: round.internal,
            value: round.value
        }
    })
    this._stuff(now, pulse, {
        from: round.quorum,
        to: [ to ],
        message: {
            type: 'accepted',
            promise: round.promise,
            quorum: round.quorum
        }
    })
    this._stuff(now, pulse, {
        from: round.quorum,
        to: [ to ],
        message: {
            type: 'decided',
            promise: round.promise,
            quorum: round.quorum
        }
    })
}

Legislator.prototype._whenPulse = function (now, event) {
    if (this.government.majority[0] == this.id) {
        this._nothing(now, [])
    }
}

Legislator.prototype._whenPing = function (event) {
    if (~this.constituency.indexOf(event.id)) {
        this._dispatch({
            pulse: false,
            route: [ this.id, event.id ],
            to: event.id,
            message: this._ping(now)
        })
    }
}

Legislator.prototype._receivePing = function (now, pulse, envelope, message) {
    var peer = this.getPeer(envelope.from)
    peer.extant = true
    peer.timeout = 0
    peer.when = now
    peer.enacted = message.enacted
    peer.decided = message.decided
    this._stuff(now, pulse, {
        to: [ envelope.from ],
        message: {
            type: 'pong',
            when: message.when,
            enacted: this.getPeer(this.id).enacted,
            decided: this.getPeer(this.id).decided
        }
    })
}

// TODO Include failues in a pong and they will always return to the leader.
// TODO Redo an election, or government immediately, if the only reason it was
// rejected was because it was out of sync.
// TODO What was the gap that made it impossible?
Legislator.prototype._receivePong = function (now, pulse, envelope, message) {
    var peer = this.getPeer(envelope.from, {
        now: now,
        enacted: message.enacted,
        decided: message.decided
    }), ponged = false
    // TODO Assert you've not pinged a timed out peer.
    if (peer.extant) {
        if (peer.timeout) {
            ponged = true
        }
    } else {
        ponged = true
    }
    peer.extant = true
    peer.timeout = 0
    var impossible = message.enacted != '0/0' && Monotonic.compare(this.log.min().promise, message.enacted) > 0
    if (impossible) {
        peer.timeout = this.timeout
    }
    this._dirty = this._dirty || ponged
}

Legislator.prototype.emigrate = function (now, id) {
    this._signal('emigrate', [ now, id ])
    assert(this._Date.now() == now, 'now is wrong')
    this._dispatch({
        from: id,
        to: this.id,
        message: {
            type: 'failed',
            value: {}
        }
    })
}

Legislator.prototype._propagation = function (now) {
    assert(arguments.length == 1)
    this.citizens = this.government.majority.concat(this.government.minority)
                                            .concat(this.government.constituents)
    this.parliament = this.government.majority.concat(this.government.minority)

    this.constituency = []
    if (this.parliament.length == 1) {
        if (this.id == this.government.majority[0]) {
            this.constituency = this.government.constituents.slice()
        }
    } else {
        var index = this.government.majority.slice(1).indexOf(this.id)
        if (~index) {
            var length = this.government.majority.length - 1
            this.constituency = this.government.minority.filter(function (id, i) {
                return i % length == index
            })
            assert(this.government.minority.length != 0, 'no minority')
        } else {
            var index = this.government.minority.indexOf(this.id)
            if (~index) {
                var length = this.government.minority.length
                this.constituency = this.government.constituents.filter(function (id, i) {
                    return i % length == index
                })
            }
        }
    }
    assert(!this.constituency.length || this.constituency[0] != null)
    this.scheduler.clear()
    if (this.government.majority[0] == this.id) {
        this._schedule(now, {
            type: 'pulse',
            id: this.id,
            delay: this.ping
        })
    } else if (~this.government.majority.slice(1).indexOf(this.id)) {
        this._schedule(now, {
            type: 'collapse',
            id: this.id,
            delay: this.timeout
        })
    }

    this.constituency.forEach(function (id) {
        this._schedule(now, {
            type: 'ping',
            id: id,
            delay: this.ping
        })
    }, this)
}

Legislator.prototype._enactGovernment = function (now, round) {
    this._signal('_enactGovernment', [ round ])
    delete this.election

    var min = this.log.min()
    var terminus = this.log.find({ promise: round.value.terminus.promise })
    if (!terminus) {
        this.log.insert(terminus = round.value.terminus)
    }
    if (!terminus.enacted) {
        terminus.enacted = true
    }

    assert(Monotonic.compare(this.government.promise, round.promise) < 0, 'governments out of order')

    // when we vote to shrink the government, the initial vote has a greater
    // quorum than the resulting government. Not sure why this comment is here.
    // TODO Deep copy.
    this.government = JSON.parse(JSON.stringify(round.value.government))
    this.locations = JSON.parse(JSON.stringify(round.value.locations))

    var previous = Monotonic.toWords(terminus.promise)
    if (round.value.government.naturalize) {
        this.government.constituents.push(this.government.naturalize.id)
        this.locations[this.government.naturalize.id] = this.government.naturalize.location
        if (round.value.government.naturalize.id == this.id) {
            previous = Monotonic.toWords('0/0')
        }
    }
    previous[1] = [ 0 ]
    this.log.find({ promise: Monotonic.toString(previous) }).nextGovernment = round



    if (this.id != this.government.majority[0]) {
        this.proposals.length = 0
    }

    this._propagation(now)
}

Legislator.prototype.naturalize = function (now, id, location) {
    this._signal('naturalize', [ now, id ])
    assert(typeof id == 'string', 'id must be a hexidecmimal string')
    this.naturalization = now
    return this.post(now, now, { type: 'naturalize', id: id, location: location }, true)
}

Legislator.prototype._whenCollapse = function () {
    this.collapse()
}

Legislator.prototype._elect = function () {
    if (!this.collapsed) {
        return null
    }
    assert(~this.government.majority.indexOf(this.id), 'would be leader not in majority')
    var parliament = this.government.majority.concat(this.government.minority)
    var unknown = { timeout: 1 }
    var present = parliament.filter(function (id) {
        return id != this.id && (this._peers[id] || unknown).timeout == 0
    }.bind(this))
    if (present.length + 1 < this.government.majority.length) {
        return null
    }
    var parliamentSize = parliament.length <= 3 ? 1 : 3
    var newParliament = [ this.id ].concat(present).slice(0, parliamentSize)
    var majoritySize = Math.ceil(parliamentSize / 2)
    var routeLength = Math.ceil(parliament.length / 2)
    return {
        quorum: parliament.slice(0, routeLength),
        government: {
            majority: newParliament.slice(0, majoritySize),
            minority: newParliament.slice(majoritySize)
        }
    }
}

Legislator.prototype._expand = function () {
    if (this.collapsed) {
        return null
    }
    var parliament = this.government.majority.concat(this.government.minority)
    if (parliament.length == this.parliamentSize) {
        return null
    }
    assert(~this.government.majority.indexOf(this.id), 'would be leader not in majority')
    var parliamentSize = parliament.length + 2
    var unknown = { timeout: 1 }
    var present = parliament.slice(1).concat(this.government.constituents).filter(function (id) {
        return (this._peers[id] || unknown).timeout == 0
    }.bind(this))
    if (present.length + 1 < parliamentSize) {
        return null
    }
    var newParliament = [ this.id ].concat(present).slice(0, parliamentSize)
    var majoritySize = Math.ceil(parliamentSize / 2)
    return {
        // quorum: this.government.majority,
        quorum: newParliament.slice(0, majoritySize),
        government: {
            majority: newParliament.slice(0, majoritySize),
            minority: newParliament.slice(majoritySize)
        }
    }
}

Legislator.prototype._impeach = function () {
    if (this.collapsed) {
        return null
    }
    var timedout = this.government.minority.filter(function (id) {
        return this._peers[id] && this._peers[id].timeout >= this.timeout
    }.bind(this)).length != 0
    if (!timedout) {
        return null
    }
    var candidates = this.government.minority.concat(this.government.constituents)
    var minority = candidates.filter(function (id) {
        return this._peers[id] && this._peers[id].timeout < this.timeout
    }.bind(this)).slice(0, this.government.minority.length)
    if (minority.length == this.government.minority.length) {
        return {
            majority: this.government.majority,
            minority: minority
        }
    }
    var parliament = this.government.majority.concat(this.government.minority)
    var parliamentSize = parliament.length <= 3 ? 1 : 3
    var unknown = { timeout: 1 }
    var newParliament = this.government.majority.slice(0, parliamentSize)
    var majoritySize = Math.ceil(parliamentSize / 2)
    return {
        quorum: this.government.majority,
        government: {
            majority: newParliament.slice(0, majoritySize),
            minority: newParliament.slice(majoritySize)
        }
    }
}

Legislator.prototype._exile = function () {
    if (this.collapsed) {
        return null
    }
    var responsive = this.government.constituents.filter(function (id) {
        return !this._peers[id] || this._peers[id].timeout < this.timeout
    }.bind(this))
    if (responsive.length == this.government.constituents.length) {
        return null
    }
    var exiles = this.government.constituents.filter(function (id) {
        return this._peers[id] && this._peers[id].timeout >= this.timeout
    }.bind(this))
    return {
        quorum: this.government.majority,
        government: {
            majority: this.government.majority,
            minority: this.government.minority,
            exiles: exiles
        }
    }
}

// TODO Merge all the above once it settles.
Legislator.prototype._ponged = function () {
    if (this.collapsed) {
        return this._elect()
    } else if (this.government.majority[0] == this.id) {
        return this._impeach() || this._exile() || this._expand()
    } else {
        return null
    }
}

module.exports = Legislator
