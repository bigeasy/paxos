var assert = require('assert')

// Monitor the reachability of islanders in order to suggest the shape of a new
// government. The `Shaper.update` method is invoked with a islander id and a
// reachability status. `Shaper.update` returns either a new government to
// appoint or `null`. Once `Shaper.update` returns a new government to appoint
// the `Shaper` object is used up and should be replaced.

// We determine reachability elsewhere so that the `Shaper.update` method is
// only ever called with a true or false value for reachable. For the purposes
// of `Shaper` reachability is defined as follows.

// * A islander is reachable if the islander responds to pings and has
// acclimated.
// * A islander is unreachable if the islander does not respond to pings.

// If the islander responds to pings, but has not acclimated, it is neither
// reachable nor unreachable and we don't want to hear about it.

// Notes:

// Could think harder about priorities as they relate to healing. Wouldn't want
// to starve the recovery of the cluster by performing arrivals only, when newly
// acclimated islanders could join the legislature and preserve the republic.

// Note that we currently favor impeachment because the minority updates the
// constituents. A non-functioning minority member would keep all of its
// constituents in the dark.

// We favor filling empty seats in government as soon as they are detected.

// We favor shrinking the government as soon as it becomes obvious that the
// government size is less than the population of the island.

// All this assuming an external mechanism for tracking pings that will
// calculate when a particular islander is reachable or unreachable. After
// `update` returns a reshape operation, the `Shaper` object is consumed. At
// that point you should no longer call `Shaper`. Put a dummy shape object in
// its place.

// A new `Shaper` object should then be created when a new government is
// created.

// I'm imagining that the unreachability of an islander will be remembered so
// that when a new government is created the unreachability can replayed. Causes
// me to muse about whether it should be possible for a islander to become
// reachable again, whether we should continue to ping the islander, or if we
// simply surrender.

// In the case of collapse when we switch to paxos, it seems that we'll keep on
// trying and trying such that we could recover from a network outage in the
// case of paxos.

// TODO Try to recall what you need to do to grow correctly. Who is supposed to
// be in that quorum?

// TODO Work into the words above that filling seats is urgent, but not
// expanding the government to the desired government size.

// TODO Stop saying "quorum" when you mean "seats filled."

//
class Shaper {
    constructor (parliamentSize, government, recovered) {
        this._parliamentSize = government.majority.length * 2 - 1
        this._shouldExpand = parliamentSize != this._parliamentSize
        this._government = government
        this._seen = {}
        this._expandable = []
        this._arriving = []
        this.decided = false
        this._governments = []
        this.outbox = {}
        this._representative = null
        this._shouldNaturalize = this._government.majority.length +
            this._government.minority.length +
            this._government.constituents.length != this._government.acclimated.length
        this._shouldRecover(recovered) || this._shouldContract()
    }

    _shouldRecover (recovered) {
        if (recovered) {
            this._governments.push({
                quorum: this._government.majority,
                government: {
                    majority: this._government.majority,
                    minority: this._government.minority
                }
            })
        }
    }

    _shouldContract () {
        if (
            this._government.promise != '0/0' &&
            this._government.majority.length + this._government.minority.length != this._parliamentSize
        ) {
            var majority = this._government.majority.slice()
            var minority = this._government.minority.slice()
            minority.unshift(majority.pop())
            var demote = minority.pop()
            this._governments.push({
                quorum: this._government.majority,
                government: {
                    majority: majority,
                    minority: minority,
                    demote: demote
                }
            })
        }
    }

    unreachable (unreachable) {
        if (this.decided) {
            return null
        }

        var id = this._government.arrived.id[unreachable]
        assert(id != null, 'unable to determine unreachable id')

        // Depart any unreachable islanders.
        return this._governments.shift() || {
            quorum: this._government.majority,
            government: {
                majority: this._government.majority,
                minority: this._government.minority.filter(function ($id) { return $id != id }),
                departed: id
            }
        }
    }

    acclimate (promise) {
        if (this.decided) {
            return null
        }

        var government = this._government

        var id = government.arrived.id[promise]
        assert(id != null, 'unable to determine acclimate id')


        assert(!~government.acclimated.indexOf(id), 'already acclimated')

        return this._governments.shift() || {
            quorum: this._government.majority,
            government: {
                majority: this._government.majority,
                minority: this._government.minority,
                acclimate: id
            }
        }
    }

    // `Shaper.update` determines if a new government should be created that has a
    // new shape. Note that embark and arrive takes place is elsewhere.

    //
    acclimated (id) {
        if (this.decided) {
            return null
        }

        // We're not going to return an expanded government until we get two
        // expandable entries so if we have a contraction it will go the first time
        // acclimated is called.
        if (~this._government.majority.indexOf(id)) {
            // Majority members are not our responsibility. They trigger their own
            // collapse.
        } else if (this._shouldExpand && !~this._government.minority.indexOf(id)) {
            this._expandable.push(id)
            // TODO Is the quorum the new majority or the old majority?
            // TODO Think about growth commit race conditions again.

            //
            if (this._expandable.length == 2) {
                // We should expand and we have islanders who can be appointed to
                // the government so let's grow the government.
                var majority = this._government.majority.slice()
                var minority = this._government.minority.slice()
                var promote = [ this._expandable.shift(), this._expandable.shift() ]
                minority.push.apply(minority, promote)
                majority.push(minority.shift())
                return {
                    quorum: majority,
                    government: {
                        majority: majority,
                        minority: minority,
                        promote: promote
                    }
                }
            }
        }

        return this._governments.shift() || this._arrival() || null
    }

    arrived (id) {
        assert(this._arriving.length > 0 && id == this._arriving[0].id)
        this._arriving.shift()
    }

    // TODO This seems really broken to me. (It is not. Read the following
    // description and then the description in body of `embark` and then amalgamate
    // the two of them.)
    //
    // Looks broken, doesn't it? Updating the cookie and properties of an existing
    // record makes think that there is a race condition where the leader is going
    // to have a different version of the arrival message from the other majority
    // members if `embark` is called and the arrival is the `0` entry in the array.
    //
    // However, we're not using the entry in the array. Our arrival government is
    // an object created in `_arrival`. Calling `embark` for the `0` arrival is a
    // missed update if `_arrival` has been called to create an arrival government
    // from the entry. If the call to `embark` provided a different cookie, it's a
    // miss. The wrong cookie will arrive. We'll have to wait for the arrival and
    // subsequent departure followed by that higher-level departure detection that
    // will trigger a restart.
    //
    // The notes below still stand. The make sense having re-read them.
    //
    embark (arrival) {
        // We do not going to reject a duplicate embarkation for a particular id.
        //
        // Here is a race condition and how it will shake itself out.
        //
        // We could be in the middle of arriving a particular islander id when the
        // islander crashed restarts and submits a new cookie. We will update the
        // cookie here, but that's not going to be the same as the cookie that got
        // written into the log.
        //
        // We can make it a general case that if the cookies mismatch
        // every one is very disappointed. Thus, we can catch this on sync.
        for (var i = 0, I = this._arriving.length; i < I; i++) {
            if (this._arriving[i].id == arrival.id) {
                break
            }
        }
        if (i == this._arriving.length) {
            this._arriving.push(arrival)
        } else {
            this._arriving[i].properties = arrival.properties
            this._arriving[i].cookie = arrival.cookie
            this._arriving[i].acclimated = arrival.acclimated
        }

        // Do nothing if our container indicates that a decision has been reached.
        return this.decided ? null : this._arrival()
    }

    // Generate an arrival government if we have an arrival available.

    //
    _arrival () {
        if (this._arriving.length) {
            var arrival = this._arriving[0]
            return {
                quorum: this._government.majority,
                government: {
                    majority: this._government.majority,
                    minority: this._government.minority,
                    arrive: {
                        id: arrival.id,
                        properties: arrival.properties,
                        cookie: arrival.cookie
                    },
                    acclimate: arrival.acclimated ? arrival.id : null
                }
            }
        }
        return null
    }

    static null = {
        unreachable: function () { return null },
        acclimate: function () { return null },
        _arriving: []
    }
}

module.exports = Shaper
