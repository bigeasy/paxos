// Common utilities.
const assert = require('assert')

// Updated upstream Paxos for a fix to a bug where it would add a member
// to the government as part of expansion that it just rejected because
// it was unreachable. The expandable logic will not exclude an
// acclimated member if it has disappeared; that is if we are counting
// it down for unreachable status. We where resetting unreadability
// because we where not accounting for it during collapse recovery, but
// we are accounting for disappearance, so we do not reset
// disappearance.

// Return the first not null-like value.
const { coalesce } = require('extant')

// Ever increasing serial value with no maximum value.
const Monotonic = require('./monotonic')

// A timer with named, cancelable events.
const Scheduler = require('happenstance').Scheduler

// An `async`/`aware` capable message queue used for the atomic log.
const { Queue } = require('avenue')

// The participants in the Paxos strategy.
const Proposer = require('./proposer')
const Acceptor = require('./acceptor')

// The participants in the two-phase commit strategy.
const Shaper = require('./shaper')
const Writer = require('./writer')
const Recorder = require('./recorder')

// ### Constructor
class Paxos {
    constructor (now, id, options) {
        assert(arguments.length == 3)
        // Uniquely identify ourselves relative to the other participants.
        this.id = String(id)

        // Use the create time as a cookie to identify this instance of this id.
        this.cookie = null

        // Maximum size of a parliament. The government will grow to this size.
        this.parliamentSize = coalesce(options.parliamentSize, 5)

        // The atomic log is a linked list. When head of the list is advanced the
        // entries in the list become unreachable and can be collected by the
        // garbage collector. We advance the head of the list when we are certain
        // that all participants have received a copy of the entry and added it to
        // their logs. Outstanding user iterators prevent garbage collection.
        this.log = new Queue().sync
        this._tail = this.log.shifter().sync
        this.pinged = new Queue().sync

        // Implements a calendar for events that we can check during runtime or
        // ignore during debugging playback.
        this.scheduler = new Scheduler

        // Initial government. A null government.
        this.government = {
            republic: null,
            promise: '0/0',
            majority: [],
            minority: [],
            acclimated: [],
            constituents: [],
            properties: {},
            arrived: { id: {}, promise: {} }
        }
        // Keep track of governments for bootstrapping.
        this._governments = [ null ]

        // Last promise issued.
        this._promised = null

        // Ping is the frequency of keep alive pings.
        this.ping = coalesce(options.ping, 1000)

        // Timeout when that reached marks a islander for departure.
        this.timeout = coalesce(options.timeout, 5000)

        // The islanders that this islander updates with new log entries.
        this.constituency = []

        // Entire population.
        this.population = []

        // Upper bound of the atomic log.
        this._committed = {}

        // Propagated lower bound of the atomic log.
        this._minimum = { propagated: '0/0', version: '0/0', reduced: '0/0' }
        this._minimums = {}
        this._minimums[this.id] = this._minimum

        this._acclimating = {}

        // Network message queue.
        this.outbox = new Queue().sync

        // Push the null government onto the atomic log.
        this.log.push(this.top = {
            module: 'paxos',
            method: 'government',
            promise: '0/0',
            body: this.government,
            previous: null
        })

        // Write strategy is polymorphic, changes based on whether we're recovering
        // from collapse using Paxos or writing values using two-phase commit.
        this._writer = new Writer(this, '1/0', [])
        this._recorder = new Recorder(this)

        // Shape a new government by fiat based on whose available to grow to the
        // desired government size and who is unreachable.
        this._shaper = new Shaper(this.parliamentSize, this.government, false)

        // Used for our pseudo-random number generator to vary retry times.
        this._seed = 1

        // Track unreachable islanders.
        this._disappeared = {}
        this._unreachable = {}
    }

    // ### Government

    // Constructs a new government and unshifts it onto the head of the proposal
    // queue. During two-phase commit, new governments jump to the head of the line.
    // All the user messages are given new promises whose values are greater than
    // the value of the government's promise.
    //
    // During a collapse when we are running Paxos, the new government is the only
    // message and all user messages are dropped.
    //
    // There is only ever supposed to be one new government in process or in the
    // list of proposals. Many decisions about the new government are based on the
    // current government and the current health of the island, so queuing up a
    // bunch of governments would at the very least require that we double check
    // that they are still valid.
    //
    // Basically, we have new governments queued elsewhere. Actually, we have
    // network status queued elsewhere and new governments are proposed after the
    // current new government is established based on that reachability data.

    //
    newGovernment (now, promise, quorum, government) {
        assert(arguments.length == 4)
        // Mark the shaper as complete. We won't get a new government proposal until
        // we get a new shaper.
        this._shaper.decided = true

        if (government.departed != null) {
            government.departed = {
                id: government.departed,
                promise: this.government.arrived.promise[government.departed],
                properties: this.government.properties[government.departed],
                index: {}
            }
            let index = this.government.constituents.indexOf(government.departed.id)
            if (~index) {
                government.departed.index.constituents = index
            }
            index = this.government.acclimated.indexOf(government.departed.id)
            if (~index) {
                government.departed.index.acclimated = index
            }
        } else if (government.promote != null) {
            for (let i = 0, id; (id = government.promote[i]) != null; i++) {
                government.promote[i] = { id: id, index: this.government.constituents.indexOf(id) }
            }
            government.promote.sort(function (left, right) { return right.index - left.index })
        }

        // If we are doing a two-phase commit, remap the proposals so that they have
        // a promise value in the new government.
        let remapped = government.promise = promise, map = null
        if (!this._writer.collapsed) {
            map = {}
            this._writer.proposals = this._writer.proposals.splice(0, this._writer.proposals.length).map(function (proposal) {
                proposal.was = proposal.promise
                proposal.route = government.majority
                proposal.promise = remapped = Monotonic.increment(remapped, 1)
                map[proposal.was] = proposal.promise
                return proposal
            })
        }
        this._promised = remapped

        government.map = map

        assert(this._writer.proposals.length == 0 || !Monotonic.isGovernment(this._writer.proposals[0].promise))

        this._writer.unshift({ promise: promise, quorum: quorum, body: government })
        this._writer.nudge()
    }

    // ### Bootstrap

    // Initialize the islander with a government where it is the dictator.

    //
    bootstrap (republic, now, properties) {
        this.government.republic = republic

        const government = {
            republic: republic,
            promise: '1/0',
            majority: [],
            minority: [],
            acclimate: this.id,
            constituents: [],
            map: {},
            arrive: { id: this.id, properties: properties, cookie: 0 },
            properties: {},
            arrived: { promise: {}, id: {} }
        }

        government.properties[this.id] = properties
        government.arrived.promise[this.id] = '1/0'
        government.arrived.id['1/0'] = this.id

        this._promised = '1/0'

        this._shaper.embark({ id: this.id, cookie: 0 })

        this._commit(now, { promise: '1/0', body: government, previous: '0/0' }, '0/0')
    }

    join (republic, cookie) {
        this.government.republic = republic
        this.cookie = cookie
    }

    // ### Embark and Arrive

    // TODO Is all this checking necessary? Is it necessary to return the island id
    // and leader? This imagines that the client is going to do the retry, but in
    // reality we often have the cluster perform the retry. The client needs to talk
    // to a server that can be discovered, it can't use the Paxos algorithm for
    // address resolution. From the suggested logic, it will only have a single
    // address, and maybe be told of an actual leader. What happens when that
    // address is lost? Don't see where returning `republic` and leader helps at
    // all. It is enough to say you failed, back-off and try again. The network
    // layer can perform checks to see if the recipient is the leader and hop to the
    // actual leader if it isn't, reject if it is but collapsed.
    //
    // Once you've externalized this in kibitz, remove it, or pare it down.
    _enqueuable (republic) {
        if (this._writer.collapsed || this.government.republic != republic) {
            return {
                enqueued: false,
                republic: this.government.republic,
                leader: null
            }
        }
        if (this.government.majority[0] != this.id) {
            return {
                enqueued: false,
                republic: this.government.republic,
                leader: this.government.majority[0]
            }
        }
    }

    // Note that a client will have to treat a network failure on submission as a
    // failure requiring boundary detection.
    enqueue (now, republic, message) {
        let response = this._enqueuable(republic)
        if (response == null) {
            const promise = this._promised = Monotonic.increment(this._promised, 1)
            this._writer.push({
                promise: promise,
                quorum: this.government.majority,
                body: message
            })
            this._writer.nudge()

            response = {
                enqueued: true,
                leader: this.government.majority[0],
                promise: promise
            }
        }
        return response
    }

    // TODO This is a note. I'd like to find a place to journal this. I'm continuing
    // to take measures to allow for the reuse of ids. It still feels right to me
    // that a display of government or of the census would be displayed using values
    // meaningful to our dear user; Kubernetes HOSTNAMES, AWS instance names, IP
    // address, and not something that is guaranteed unique like a UUID, because
    // such things are indistinguishable to the human observer.
    //
    // Yet, here I am again contending with an issue that would be so simple if ids
    // where required to be unique. When a islander that is a constituent dies and
    // restarts with the same id it will be pinged by someone in government, it will
    // report that it's uninitialized, and its representative will look for its
    // arrival record. There's a race now. Is the new instance going to embark
    // before its pinged? Or is the representative going to search for an arrival
    // record and not find one, which causes us to abend at the moment?
    //
    // When we get a sync before arrival, it will not see a cookie or not see the
    // right cookie and fail the sync. These syncs fail, time passes, the time out
    // comes and the record is cleared. That takes care of the race when the sync
    // beats the arrival, but what if the arrival beats the representative?
    //
    // In that case their will be a new government with the same representative with
    // the same constituent, but now there will be an arrival record. The
    // constituent will be acclimated. It will never have departed.
    //
    // This is a problem. Implementations are going to need to know that they've
    // restarted. A participant should depart before it can embark again.
    //
    // Obviously, much easier if the ids are unique. Whole new id means not
    // ambiguity. The new id arrival, the old id departs. (Unique ids are easy
    // enough to foist upon our dear user implementation wise. Most implementations
    // reset a process or at least an object, and that new instance can have a new
    // id generated from POSIX time or UUID.)
    //
    // However, we do have an atomic log at our disposal, so every time I think that
    // I should give up and go with unique ids, something comes along to make it
    // simple. I was actually musing about how the client, if they really wanted
    // pretty ids, they could just check and wait for the old id to depart, since it
    // only needs to be unique in the set of current ids. Then, duh, I can do that
    // same check on embark and reject an arrival if the id already exists in the
    // population.
    //
    // That's what you're looking at here.
    //
    // Now that that is done, though, is there a race condition where the arrival is
    // currently being proposed? The property wouldn't be removed until the proposal
    // was enacted.

    //
    embark (now, republic, id, cookie, properties, acclimated) {
        let response = this._enqueuable(republic)
        if (response == null) {
            // Do not allow the user to embark an id that already exists. This will
            // happen if an islander crash restarts and tries to rejoin before Paxos
            // can determine that the islander is no longer viable. The embarking
            // islander should enter a back off and retry loop in order to wait for
            // departure.
            if (id in this.government.properties) {
                response = {
                    enqueued: false,
                    republic: this.government.republic,
                    leader: this.government.majority[0]
                }
            } else {
                response = { enqueued: true }
                this._reshape(now, this._shaper.embark({ id: id, properties: properties, cookie: cookie, acclimated: acclimated }))
            }
        }
        return response
    }

    acclimate () {
        if (!~this.government.acclimated.indexOf(this.id)) {
            this._acclimating[this.government.arrived.promise[this.id]] = true
        }
    }

    // ### Scheduled Events

    // Timer-driven events are managed using [Happenstance](http://github.com/bigeasy/happenstance).
    // Events are scheduled by calling the `schedule` method of a Happenstance the
    // `Schedule` object for this islander. Each event has a key and scheduling an
    // event will replace an scheduled event with the same key, making it easy to
    // reset timeouts, to basically reset countdowns or replace the countdown action
    // as the role of the islander changes.

    //
    event (envelope) {
        // Other envelope times are related to timer maintenance.
        const now = envelope.now
        switch (envelope.body.method) {

        // Send a synchronization message to one or more fellow islanders. Note that
        // the to field is an array.

        //
        case 'synchronize':
            this._send({
                method: 'synchronize',
                to: envelope.body.to,
                collapsible: !! envelope.body.collapsible,
                constituent: true,
                key: envelope.key
            })
            break

        // We are a majority member that has not heard from the leader for longer
        // than the timeout so collapse the current government. This turns our
        // `Writer` into a `Proposer` and starts running Paxos.

        //
        case 'collapse':
            this._collapse(now)
            break

        // Prepare a round of Paxos. We pick from the legislators that have not
        // disappeared. If a majority of legislators have disappeared, we reset our
        // disappeared map and try anyway because what else are we going to do? Note
        // that we ignore the unreachable map during a collapse.
        //
        // TODO Collapse means Paxos. Put that in the documentation somewhere.

        //
        case 'propose':
            for (;;) {
                // If we win, we are the leader.
                const majority = [ this.id ]
                const minority = []

                // Try to find a majority of legislators.
                const parliament = this.government.majority.concat(this.government.minority)
                while (parliament.length != 0) {
                    const id = parliament.shift()
                    if (id != this.id) {
                        if (
                            majority.length == this.government.majority.length ||
                            this._disappeared[this.government.arrived.promise[id]] != null
                        ) {
                            minority.push(id)
                        } else {
                            majority.push(id)
                        }
                    }
                }

                // If we have a majority of legislators, we have have run a
                // forming this government with ourselves as leader.
                if (majority.length == this.government.majority.length) {
                    this.newGovernment(now, this._writer.promise, majority, { majority: majority, minority: minority })
                    break
                }

                // If we don't have enough reachable participants for a majority,
                // clear out our disappearance tracking in a desperate move.
                this._disappeared = {}
            }
            break
        }
    }

    // ### Collapse

    // Called by a recorder when a prepare method is received to transition from a
    // two-phase commit recorder to a Paxos acceptor.

    //
    _prepare (now, request, sync) {
        // TODO Always, really? Let the acceptor decide when to replace itself.
        this._recorder = new Acceptor(this)
        return this._recorder.request(now, request, sync)
    }

    // Collapse means we schedule a round of Paxos.

    //
    _collapse (now) {
        this.scheduler.clear()

        // TODO Really need to have the value for previous, which is the writer register.
        this._writer = new Proposer(this, this.government.promise)
        this._propose(now, false)
    }

    // Note that even if the PNRG where not deterministic, it wouldn't matter during
    // replay because the delay is lost and the actual timer event is recorded.

    // TODO Convince yourself that the above is true and the come back and replace
    // this PRNG with `Math.rand()`. TODO Meh.

    // TODO Consider how to back off. If the leader is gone and two majority members
    // are competing, do we really want them backing off for approaching "timeout"
    // milliseconds? How fast does it take to complete a round of Paxos and how big
    // of a window do we want to give two or more islanders to launch their retries
    // such that they avoid collision?

    //
    _propose (now, retry) {
        let delay = 0
        if (retry) {
            delay += 1
            if (this.id != this.government.majority[0]) {
                delay += this.ping
            }
            // PRNG: https://gist.github.com/blixt/f17b47c62508be59987b
            delay += (this._seed = this._seed * 16807 % 2147483647) % this.ping
        }
        this.scheduler.schedule(now + delay, this.id, { method: 'propose', body: null })
    }

    // ### Requests and Responses

    // Find a round of paxos in the log based on the given promise.
    //
    // Not loving how deeply nested these conditions and keys are, but I understand
    // why it is that way, and it would be a full wrapper of `bintrees` to fix it.

    //
    _findRound (sought) {
        const shifter = this._tail.shifter().sync
        while (shifter.peek().promise != sought) {
            shifter.shift()
        }
        return shifter
    }

    _sync (committed) {
        const sync = {
            republic: this.government.republic,
            promise: this.government.arrived.promise[this.id],
            from: this.id,
            minimum: this._minimum,
            government: this.government.promise,
            collapsed: this._writer.collapsed,
            committed: this.top.promise,
            commits: []
        }
        if (committed == null) {
            sync.synced = false
        } else {
            assert(Monotonic.compare(committed, this._minimum.propagated) >= 0, 'minimum breached')
            assert(Monotonic.compare(committed, this.top.promise) <= 0, 'maximum breached')
            const shifter = this._findRound(committed)
            shifter.shift()

            let count = 24
            while (--count && shifter.peek() != null) {
                const iterator = shifter.shift()
                sync.commits.push({
                    promise: iterator.promise,
                    body: iterator.body,
                    previous: iterator.previous
                })
            }
            shifter.destroy()

            sync.synced =
                sync.commits.length == 0 ||
                sync.commits[sync.commits.length - 1].promise == this.top.promise
        }
        return sync
    }

    // Package a message with log synchronization messages and put it in our outbox
    // for delivery to the intended fellow islanders.
    //
    // Note that messages can take however long they're going to take. The requests
    // can always be received and the responses can always be handled. If they are
    // made invalid by their time in transit they will be rejected. Our dear user
    // needs only to send the messages to our fellow islander by any means and
    // return the responses to us all at once.

    //
    _send (message) {
        const envelopes = [], responses = {}, syncs = {}
        let government = null
        const cookie = {
            message: message,
            synchronize: false,
            government: this.government.promise,
            collapsed: this._writer.collapsed
        }
        for (let i = 0, to; (to = message.to[i]) != null; i++) {
            this.scheduler.unschedule(to)

            const promise = this.government.arrived.promise[to]
            let committed = coalesce(this._committed[promise])

            if (committed == '0/0') {
                const arrivals = []
                const shifter = this._tail.shifter().sync
                for (;;) {
                    if (shifter.peek() == null) {
                        break
                    }
                    const iterator = shifter.shift()
                    if (Monotonic.isGovernment(iterator.promise)) {
                        const arrive = iterator.body.arrive
                        if (arrive && arrive.id == to) {
                            arrivals.push(iterator)
                        }
                    }
                }
                shifter.destroy()

                // Use to be the case that we would accommodate a missing arrival
                // record by preemptively setting the response to `null` and
                // excluding it from the envelopes sent. This was necessary when the
                // log length was trimmed by virtue of a max log length so that an
                // arrival record could get pruned before the arriving islander
                // received it's first synchronization.
                //
                // Now we will only prune the log when everyone has received the
                // message. The arrival record will have added the islander to the
                // population and it will only be removed when the entire
                // population, including the arriving islander, receives the
                // message. If the arriving islander departs, the arrival record
                // will only be pruned after the departure completes.

                //
                assert(arrivals.length != 0, 'no arrival found')

                const arrival = arrivals.pop()
                committed = arrival.previous

                for (let j = 1, J = this._governments.length; j < J; j++) {
                    if (this._governments[j].promise == arrival.promise) {
                        government = this._governments[j - 1]
                        break
                    }
                }
            }

            syncs[to] = this._sync(committed)
            if (message.method != 'synchronize') {
                cookie.synchronize = cookie.synchronize || ! syncs[to].synced
            }
        }


        // TODO Would appear that you could push synced islanders onto one array and
        // unsynced onto another. If the unsynced is empty, send the message as
        // expected, otherwise set a `synchronize` method only, but have the desired
        // message kept in the cookie so that the response will resend it. We're
        // already doing this, but let's sort things out on this end and reduce the
        // complexity (remove one conditional) from there receiving end.
        /*
        if (cookie.synchronize && message.method != 'synchronize') {
            console.log('---', message.method)
        }
         */

        // Separate loop because we needed to determine whether or not we
        // `synchronize` separately.
        //
        // TODO Why can't  synchronize property be a property of the cookie?
        // TODO Can we build and array and map it at the end instead of working
        // though the messages array?
        // TODO I don't like how if one target needs to sync then everyone needs to
        // sync and I'm not sure how that state arises.
        for (let i = 0, to; (to = message.to[i]) != null; i++) {
            envelopes.push({
                from: this.id,
                to: to,
                properties: this.government.properties[to],
                cookie: cookie,
                request: {
                    message: message,
                    government: government,
                    synchronize: cookie.synchronize || message.method == 'synchronize',
                    sync: syncs[to]
                },
                responses: responses
            })
        }

        // Structured so that you can invoke `_response` using either an individual
        // envelope or the entire send structure.
        this.outbox.push({
            from: this.id,
            properties: this.government.properties[this.id],
            cookie: cookie,
            responses: responses,
            envelopes: envelopes
        })
    }

    static compare = Monotonic.compare
    static isGovernment = Monotonic.isGovernment
    static increment = Monotonic.increment

    // TODO Note that minimum only ever goes up so a delayed minimum is not going to
    // ever be invalid. We don't want to run it in case it rejects our start.

    //
    request (now, request) {
        if (request.sync.republic != this.government.republic) {
            return { message: { method: 'unreachable' } }
        } else if (
            this.government.arrived.promise[request.sync.from] != request.sync.promise
        ) {
            if (this.government.promise == '0/0') {
                if (request.sync.commits.length == 0) {
                    return {
                        message: { method: 'respond', promise: '0/0' },
                        sync: this._sync(null),
                        government: null
                    }
                }
                if (
                    !Monotonic.isGovernment(request.sync.commits[0].promise) ||
                    request.sync.commits[0].body.arrive == null ||
                    request.sync.commits[0].body.arrive.id != this.id ||
                    request.sync.commits[0].body.arrive.cookie != this.cookie
                ) {
                    return { message: { method: 'unreachable' } }
                }
                this.government = request.government
                this._commit(now, request.sync.commits[0], request.sync.commits[0].previous)
            } else {
                return { message: { method: 'unreachable' } }
            }
        }

        if (Monotonic.compare(this._minimum.propagated, request.sync.minimum.propagated) < 0) {
            this._minimum.propagated = request.sync.minimum.propagated
        }

        let message
        if (
            Monotonic.compare(request.sync.committed, this.top.promise) < 0
        ) {
            return {
                message: {
                    method: 'reject',
                    promise: this.top.promise,
                },
                government: null,
                sync: {
                    promise: this.government.arrived.promise[this.id],
                    committed: null,
                    commits: []
                },
                backwards: true
            }
        } else {
            this._synchronize(now, request.sync.commits)

            while (Monotonic.compare(this._tail.peek().promise, this._minimum.propagated) < 0) {
                const entry = this._tail.shift()
                if (entry.government != null) {
                    assert(entry.promise == this._governments[1].promise, 'wrong government at shift time')
                    this._governments.shift()
                }
            }

            if (
                ~this.government.majority.slice(1).indexOf(this.id) &&
                ! this._writer.collapsed
            ) {
                this.scheduler.schedule(now + this.timeout, this.id, {
                    module: 'paxos',
                    method: 'collapse',
                    body: null
                })
            }

            if (! this._writer.collapsed) {
                this.pinged.push(true)
            }

            message = request.synchronize
                    ? { method: 'synchronized', promise: this.top.promise }
                    : this._recorder.request(now, request.message)
        }
        return {
            message: message,
            sync: this._sync(null),
            government: this.government.promise,
            minimum: this._minimum,
            acclimating: this._acclimating,
            unreachable: this._unreachable
        }
    }

    response (now, cookie, responses) {
        // We only process messages if the government that generated them is the
        // same as our current government. This is so that promises match ids
        // correctly, so that we're not processing an old message with out of date
        // id to promise mappings or missing mappings. We make an exception for a
        // successful network connection, which we use to delete a disappeared flag.

        //
        const message = cookie.message
        for (let i = 0, I = message.to.length; i < I; i++) {
            // Deduce recipient properties.
            const id = message.to[i]
            const promise = this.government.arrived.promise[id]
            let response = responses[id]
            // If the islander is unreachable we create a dummy record that uses our
            // current government for the government promise and a bunch of defaults
            // so that it will pass through the logic.
            if (
                response == null ||
                response.message.method == 'unreachable' ||
                !
                (
                    promise == response.sync.promise ||
                    '0/0' == response.sync.committed
                )
            ) {
                responses[id] = response = {
                    message: { method: 'unreachable', promise: '0/0' },
                    sync: { committed: null, commits: [] },
                    minimum: null,
                    unreachable: {},
                    government: this.government.promise
                }
            } else {
                delete this._disappeared[coalesce(promise, '0/0')]
            }
        }

        // TODO Why was it important that we keep pinging constituents while we are
        // negotiating a new government? Because it's not happening now. We stop if
        // we've received a new government since this message has been sent.
        if (
            cookie.government != this.government.promise ||
            cookie.collapsed != this._writer.collapsed
        ) {
            return
        }

        let uncommunicative = false

        // Perform housekeeping for each recipient of the message.

        //
        for (let i = 0, I = message.to.length; i < I; i++) {
            // Deduce recipient properties.
            const id = message.to[i]
            const promise = this.government.arrived.promise[id]
            const response = responses[id]

            // Go through responses converting network errors to "unreachable"
            // messages with appropriate defaults.
            switch (response.message.method) {
            case 'unreachable':
                if (this._disappeared[promise] == null) {
                    this._disappeared[promise] = now
                } else if (now - this._disappeared[promise] >= this.timeout) {
                    response.unreachable[promise] = true
                }
            case 'reject':
                uncommunicative = true
                break
            }

            // If we are out of date, then update our log. Otherwise, record the
            // recipient's most committed message. Do not record the recipient's
            // most committed message if it is ahead of us.
            if (response.sync.committed != null) {
                this._committed[promise] = response.sync.committed
            }

            // TODO Make a note to yourself somewhere, probably in tests, that if
            // you do want to deal with tricksy messages then testing is simple. At
            // this point, you're trying to winnow down conditions by breaking up
            // operations and guarding them on pre-conditions. The one on your mind
            // now is that if you want to do something that requires translating a
            // promise to an id or vice-versa, then you're going to need to have the
            // government that was active when that promise or id was posited.

            // You'll forget this but, when you do add checks to validate the
            // structure of a message you will test it by calling these methods
            // directly. Testing that sort of thing would be simple. First, though,
            // you want to create the happy path and see that it is covered. Then
            // you have to deicide if you want to protect against malicious messages
            // or if you're going to assume that you're on an secure network.

            // The following operations assume that the islander we're talking too
            // is operating under the same government as ourselves. We want promise
            // or id look ups to not return null.

            //

            // If the message was generated using government information that does
            // not match our current government, do not use it to update our
            // housekeeping state.
            if (this.government.promise != response.government) {
                continue
            }

            // Update set of unreachable islanders.
            for (const unreachable in response.unreachable) {
                if (!this._unreachable[unreachable]) {
                    this._unreachable[unreachable] = true
                    this._reshape(now, this._shaper.unreachable(unreachable))
                }
            }

            for (const acclimating in response.acclimating) {
                if (!this._acclimating[acclimating]) {
                    this._acclimating[acclimating] = true
                    this._reshape(now, this._shaper.acclimate(acclimating))
                }
            }

            // Reduce our least committed promise. Would switch to using promises as
            // the key in the minimum map, but out of date minimum records are never
            // able to do any damage. They will get updated eventually.
            const minimum = response.minimum
            if (
                message.constituent &&
                minimum &&
                (
                    this._minimums[id] == null ||
                    this._minimums[id].version != minimum.version ||
                    this._minimums[id].reduced != minimum.reduced
                )
            ) {
                this._minimums[id] = {
                    version: minimum.version,
                    propagated: minimum.propagated,
                    reduced: minimum.reduced
                }

                let reduced = this.top.promise

                for (let j = 0, constituent; (constituent = this.constituency[j]) != null; j++) {
                    if (
                        this._minimums[constituent] == null ||
                        this._minimums[constituent].version != this.government.promise ||
                        this._minimums[constituent].reduced == '0/0'
                    ) {
                        reduced = '0/0'
                        break
                    }
                    if (Monotonic.compare(this._minimums[constituent].reduced, reduced) < 0) {
                        reduced = this._minimums[constituent].reduced
                    }
                }

                this._minimum = {
                    propagated: this.id == this.government.majority[0] ? reduced : this._minimum.propagated,
                    version: this.government.promise,
                    reduced: reduced
                }
            }
        }

        if (uncommunicative && message.collapsible) {
            this._writer.collapse(now, message, responses)
        }

        if (
            !(
                cookie.government == this.government.promise &&
                cookie.collapsed == this._writer.collapsed
            )
        ) {
            return
        }

        // Here's were I'm using messages to drive the algorithm even when the
        // information is available for recalculation.
        //
        // There are two types of explicit synchronize. The leader will sync its log
        // with its majority, other members of the government will sync with their
        // constituents. With a majority sync, the leader will sync with all of the
        // majority members at once, any one of them failing triggers a collapse.
        //
        // Consistent synchronize messages are sent to each constituent
        // individually.
        //
        // TODO This is new.

        // Pings keep on going. When you start one it will perpetuate until the
        // government is superseded. If you want to synchronize before a ping,
        // simply schedule the ping immediately. If there is an outstanding ping
        // when you jump the gun, that's fine. Pings are pretty much always valid.
        // Won't this duplicate mean you now have two ping intervals? No. The
        // duplicate messaging will be reduced when the next ping gets scheduled
        // because you can only have one scheduled per key.

        //
        if (message.method == 'synchronize' && !cookie.synchronize) {
            // How long to wait before our next ping.
            let delay = 0

            // Use the ping interval if the islander is unreachable or if it is
            // already up to date.
            if (
                uncommunicative ||
                this.top.promise == responses[message.to[0]].sync.committed
            ) {
                delay = this.ping
            }

            // TODO Come back and consider this so you know that it is true.

            // Synchronizations live for the life of a government. We are not going
            // to double up or otherwise accumulate pings. They will be created by
            // with the promise of the government registered by the commit. If there
            // is a change of government the response won't get beyond the first
            // exit of this function.

            // A keep alive might collapse the government, but it would then take
            // the last exit of this function before rescheduling itself.
            this.scheduler.schedule(now + delay, message.key, {
                method: 'synchronize', to: message.to, collapsible: message.collapsible
            })
        } else if (!uncommunicative) {
            if (cookie.synchronize) {
                this._send(cookie.message)
            } else {
                // TODO I don't like how the `Recorder` gets skipped on collapse,
                // but the `Acceptor` handles it's own failures. My fastidiousness
                // tells my that this one bit of reject logic escaping to another
                // function in another file is an indication of poor design and that
                // a design pattern is required to make this architecturally sound.
                // However, the bit that is escaping is the only bit that will be
                // dealing with inspecting returned promises and deciding a specific
                // next action, it is Paxos logic that does not otherwise exist, it
                // might actually be an additional layer.

                //
                this._writer.response(now, message, responses)
            }
        }
    }

    // ### Commit

    _register (now, register) {
        const entries = []
        while (register) {
            entries.push(register.body)
            register = register.previous
        }

        entries.reverse()

        for (let i = 0, entry; (entry = entries[i]) != null; i++) {
            this._commit(now, entry, this.top.promise)
        }
    }

    _synchronize (now, entries) {
        for (let i = 0, entry; (entry = entries[i]) != null; i++) {
            this._commit(now, entry, this.top.promise)
        }
    }

    _reshape (now, shape) {
        if (shape != null) {
            const promise = Monotonic.increment(this.government.promise, 0)
            this.newGovernment(now, promise, shape.quorum, shape.government)
        }
    }

    _commit (now, entry, top) {
        entry = JSON.parse(JSON.stringify(entry))

        // We already have this entry. The value is invariant, so let's assert
        // that the given value matches the one we have.

        //
        if (Monotonic.compare(entry.promise, top) <= 0) {
            const shifter = this._findRound(entry.promise)
            assert.deepStrictEqual(shifter.shift().body, entry.body)
            shifter.destroy()
            return
        }

        // Otherwise, we assert that entry has a correct previous promise.
        assert(top == entry.previous, 'incorrect previous')

        const isGovernment = Monotonic.isGovernment(entry.promise)
        assert(isGovernment || Monotonic.increment(top, 1) == entry.promise)

        let government = null

        if (isGovernment) {
            assert(Monotonic.compare(this.government.promise, entry.promise) < 0, 'governments out of order')
            this.government.promise = entry.promise
            this.government.majority = entry.body.majority
            this.government.minority = entry.body.minority
            if (entry.body.arrive != null) {
                if (entry.promise == '1/0') {
                    this.government.majority.push(entry.body.arrive.id)
                } else {
                    this.government.constituents.push(entry.body.arrive.id)
                }
                this.government.arrived.id[this.government.arrived.promise[entry.body.arrive.id]]
                this.government.arrived.promise[entry.body.arrive.id] = entry.promise
                this.government.arrived.id[entry.promise] = entry.body.arrive.id
                this.government.properties[entry.body.arrive.id] = entry.body.arrive.properties
            } else if (entry.body.departed != null) {
                delete this.government.arrived.id[this.government.arrived.promise[entry.body.departed.id]]
                delete this.government.arrived.promise[entry.body.departed.id]
                delete this.government.properties[entry.body.departed.id]
                if ('constituents' in entry.body.departed.index) {
                    this.government.constituents.splice(entry.body.departed.index.constituents, 1)
                }
                if ('acclimated' in entry.body.departed.index) {
                    this.government.acclimated.splice(entry.body.departed.index.acclimated, 1)
                }
            } else if (entry.body.promote != null) {
                // TODO Replace these with `of`.
                for (let i = 0, promotion; (promotion = entry.body.promote[i]) != null; i++) {
                    this.government.constituents.splice(promotion.index, 1)
                }
            } else if (entry.body.demote != null) {
                this.government.constituents.unshift(entry.body.demote)
            }
            if (entry.body.acclimate != null) {
                this.government.acclimated.push(entry.body.acclimate)
            }

            const parliament = this.government.majority.concat(this.government.minority)
            if (parliament.length == 1) {
                if (this.id == this.government.majority[0]) {
                    this.constituency = this.government.constituents
                    this.representative = null
                } else {
                    this.constituency = []
                    this.representative = this.government.majority[0]
                }
            } else if (this.government.majority[0] == this.id) {
                this.constituency = this.government.majority.slice(1)
                this.representative = null
            } else {
                const majority = this.government.majority.slice(1)
                let index = majority.indexOf(this.id)
                if (~index) {
                    const length = majority.length
                    const population = this.government.minority.length == 0 ? this.government.constituents : this.government.minority
                    this.constituency = population.filter(function (id, i) { return i % length == index })
                    this.representative = this.government.majority[0]
                } else if (~(index = this.government.minority.indexOf(this.id))) {
                    this.constituency = this.government.constituents.filter((id, i) => {
                        return i % this.government.minority.length == index
                    })
                    this.representative = this.government.majority.slice(1).filter((id, i) => {
                        return index % majority.length == i
                    }).shift()
                } else {
                    const index = this.government.constituents.indexOf(this.id)
                    const representatives = this.government.minority.length == 0 ? majority : this.government.minority
                    this.constituency = []
                    this.representative = representatives.filter((id, i) => {
                        return index % representatives.length == i
                    }).shift()
                }
            }

            this.population = this.government.majority
                                  .concat(this.government.minority)
                                  .concat(this.government.constituents)

            government = JSON.parse(JSON.stringify(this.government))
            this._governments.push(government)
        }

        this.log.push(this.top = {
            module: 'paxos',
            government: government,
            method: isGovernment ? 'government' : 'entry',
            promise: entry.promise,
            body: entry.body,
            previous: entry.previous
        })
        // We know what our most committed record it is at this moment, so we record
        // it in our most-committed table used to manage propagation.
        //
        // At one point we assumed that the pinging would update committed and
        // propagated so we didn't update here. However, we only update committed
        // and propagated for our constituency which never includes ourselves. Our
        // minimum propagated promise forward based on our constituency without
        // updating the committed record we keep to ping ourselves with the minimum
        // propagated promise causes us to attempt to ping ourselves with a record
        // we've disposed of.
        this._committed[this.government.arrived.promise[this.id]] = entry.promise

        if (isGovernment) {
            this.scheduler.clear()

            // If we collapsed and ran Paxos we would have carried on regardless of
            // reachability until we made progress. During Paxos we ignore
            // reachability so we delete it here in case we happened to make
            // progress in spite of it.
            if (entry.body.map == null) {
                for (const id of this.government.majority) {
                    // TODO Probably okay to track by id. The worst that you can do
                    // is delete reachable information that exists for a subsequent
                    // version, well, the worse you can do is get rid of information
                    // that will once again materialize.
                    delete this._unreachable[this.government.arrived.promise[id]]
                }
                for (const id of this.government.minority) {
                    delete this._unreachable[this.government.arrived.promise[id]]
                }
            } else {
                for (const unreachable in this._unreachable) {
                    if (!(unreachable in this.government.arrived.id)) {
                        delete this._unreachable[unreachable]
                        delete this._disappeared[unreachable]
                    }
                }
            }

            for (const acclimating in this._acclimating) {
                const id = this.government.arrived.id[acclimating]
                if (!~this.population.indexOf(id) || ~this.government.acclimated.indexOf(id)) {
                    delete this._acclimating[acclimating]
                }
            }

            this._writer = this._writer.createWriter(entry.promise)
            this._recorder = this._recorder.createRecorder(entry.promise)

            // Chose a strategy for handling pings.
            if (this.id == this.government.majority[0]) {
                // If we are the leader, we are going to want to look for
                // opportunities to change the shape of the government.
                const shaper = new Shaper(this.parliamentSize, this.government, entry.body.map == null)
                for (const arrival of this._shaper._arriving) {
                    shaper.embark(arrival)
                }
                this._shaper = shaper
                if (entry.body.arrive) {
                    shaper.arrived(entry.body.arrive.id)
                }
                for (const promise in this._unreachable) {
                    this._reshape(now, shaper.unreachable(promise))
                }
                for (const promise in this._acclimating) {
                    this._reshape(now, shaper.acclimate(promise))
                }
                for (const id of this.government.acclimated) {
                    if (this._disappeared[this.government.arrived.promise[id]] == null) {
                        this._reshape(now, shaper.acclimated(id))
                    }
                }
            } else {
                this._shaper = Shaper.null
            }

            if (~this.government.majority.indexOf(this.id)) {
                this.scheduler.schedule(now + this.timeout, this.id, {
                    module: 'paxos',
                    method: 'collapse',
                    body: null
                })
            }

            // You cannot keep a cached value for a constituent because new
            // governments will change that constituents constituents. The reduced
            // value must be recalculated.
            this._minimum = {
                version: this.government.promise,
                propagated: this._minimum.propagated,
                reduced: '0/0'
            }
            this._minimums = {}

            const committed = {}
            for (const id of this.constituency) {
                const promise = this.government.arrived.promise[id]
                committed[promise] = this._committed[promise]
            }
            this._committed = committed

            // Reset ping tracking information. Leader behavior is different from
            // other members. We clear out all ping information for ping who are not
            // our immediate constituents. This will keep us from hoarding stale
            // ping records. When everyone performs this cleaning, we can then trust
            // ourselves to return all ping information we've gathered to anyone
            // that pings us, knowing that it is all flowing from minority members
            // to the leader. We do not have to version the records, timestamp them,
            // etc.
            //
            // If we didn't clear them out, then a stale record for a islander can
            // be held onto by a majority member. If the minority member that pings
            // the islander is no longer downstream from the majority member, that
            // stale record will not get updated, but it will be reported to the
            // leader.
            //
            // We keep ping information if we are the leader, since it all flows
            // back to the leader. All leader information will soon be updated. Not
            // resetting the leader during normal operation makes adjustments to the
            // population go faster.
        }

        if (this.constituency.length == 0) {
            this._minimum.reduced = entry.promise
        }

        // Notify our constituents of a new update.

        // TODO This is my we give the leader a zero constituency. Why did we change
        // it to point to the remainder of the majority?

        // TODO Recall that we're not going to continue to ping our constituents
        // when it comes time to noodle a Paxos waffle, so we'll ping, but not
        // update the constituency. TODO This is old and getting goofy.

        // We count on our writer to set the final synchronize when we are the
        // leader of a government that is not a dictatorship.
        if (this.id != this.government.majority[0] || this.government.majority.length == 1) {
            for (const id of this.constituency) {
                this.scheduler.schedule(now, id, { method: 'synchronize', to: [ id ], collapsible: false })
            }
        }

        if (this.id == this.government.majority[0]) {
            this.scheduler.schedule(now, this.id, {
                method: 'synchronize',
                to: this.government.majority,
                collapsible: true
            })
        }
    }

    inspect () {
        return {
            id: this.id,
            writer: this._writer.inspect(),
            recorder: this._recorder.inspect(),
            head: this.top
        }
    }
}

module.exports = Paxos
