var assert = require('assert')

// Monitor the reachability of denizens in order to suggest the shape of a new
// government. The `Shaper.update` method is invoked with a denizen id and a
// reachability status. `Shaper.update` returns either a new government to
// appoint or `null`. Once `Shaper.update` returns a new government to appoint
// the `Shaper` object is used up and should be replaced.

// We determine reachability elsewhere so that the `Shaper.update` method is
// only ever called with a true or false value for reachable. For the purposes
// of `Shaper` reachability is defined as follows.

// * A denizen is reachable if the denizen responds to pings and it naturalized.
// * A denizen is unreachable if the denizen does not respond to pings.

// If the the denizen responds to pings, but is not naturalized, it is neither
// reachable nor unreachable and we don't want to hear about it.

// Notes:

// Could think harder about priorities as they releate to healing. Wouldn't want
// to starve the recovery of the cluster by performing immigrations only, when
// newly naturalized citizens could join the legislature and preserve the
// republic.

// Note that we currently favor impeachment because the minority updates the
// constituents. A non-functioning minority member would keep all of its
// constitutents in the dark.

// We favor filling empty seats in government as soon as they are detected.

// We favor shrinking the government as soon as it becomes obvious that the
// government size is less than the population of the island.

// All this assuming an external mechnism for tracking pings that will calculate
// when a paricular participant is reachable or unreachable. After `update`
// returns a reshape operation, the `Shaper` object is consumed. At that point
// you should no longer call `Shaper`. Put a dummy shape object in its place.

// A new `Shaper` object should then be created when a new government is
// created.

// I'm imagining that the unreachability of a participant will be remembered so
// that when a new government is created the unreachability can replayed. Causes
// me to muse about whether it should be possible for a citizen to become
// reachable again, whether we should continue to ping the citizen, or if we
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
function Shaper (parliamentSize, government) {
    this._parliamentSize = government.majority.length * 2 - 1
    this._shouldExpand = parliamentSize != this._parliamentSize
    this._government = government
    this._seen = {}
    this._expandable = []
    this._immigrating = []
    this.decided = false
    this._governments = []
    this._shouldContract()
    this.outbox = {}
}

Shaper.prototype._shouldContract = function () {
    if (
        this._government.promise != '0/0' &&
        this._government.majority.length + this._government.minority.length != this._parliamentSize
    ) {
        var majority = this._government.majority.slice()
        var minority = this._government.minority.slice()
        minority.unshift(majority.pop())
        minority.pop()
        this._governments.push({
            quorum: this._government.majority,
            government: {
                majority: majority,
                minority: minority
            }
        })
    }
}

// `Shaper.update` determines if a new government should be created that has a
// new shape. Note that immigration takes place is elsewhere.

//
Shaper.prototype.update = function (id, reachable) {
    // We are interested in denizens when they are first reachable or when they
    // become unreachable. We ignore denizens that continue to be reachable.
    if (reachable && this._seen[id]) {
        return null
    }
    this._seen[id] = true

    if (this.decided) {
        return null
    }

    if (~this._government.majority.indexOf(id)) {
        // Majority members are not our resposibility. They trigger their own
        // collapse.
    } else if (!reachable) {
        // Exile any unreachable citizen.
        this._governments.push({
            quorum: this._government.majority,
            government: {
                majority: this._government.majority,
                minority: this._government.minority.filter(function ($id) { return $id != id }),
                exile: id
            }
        })
    } else if (this._shouldExpand && !~this._government.minority.indexOf(id)) {
        this._expandable.push(id)
        // TODO Is the quorum the new majority or the old majority?
        // TODO Think about growth commit race conditions again.

        //
        if (this._expandable.length == 2) {
            // We should expand and we have citzens who can be appointed to the
            // government so let's grow the government.
            var majority = this._government.majority.slice()
            var minority = this._government.minority.slice()
            minority.push(this._expandable.shift(), this._expandable.shift())
            majority.push(minority.shift())
            return {
                quorum: majority,
                government: { majority: majority, minority: minority }
            }
        }
    }

    // Otherwise let's exile someone if we have someone to exile.
    return this._governments.shift() || this._immigration() || null
}

Shaper.prototype.received = function () {
}

Shaper.prototype.immigrated = function (id) {
    assert(this._immigrating.length > 0 && id == this._immigrating[0].id)
    this._immigrating.shift()
}

Shaper.prototype.immigrate = function (immigration) {
    // We do not going to reject a duplicate immigration for a particular id.
    //
    // Here is a race condition and how it will shake itself out.
    //
    // We could be in the middle of immigrating a partuclar id when the
    // immigrant crash restarts and submits a new cookie. We will update the
    // cookie here, but that's not going to be the same as the cookie that got
    // written into the log.
    //
    // We can make it a general case that if the cookies mismatch
    // every one is very disappointed. Thus, we can catch this on sync.
    for (var i = 0, I = this._immigrating.length; i < I; i++) {
        if (this._immigrating[i].id == immigration.id) {
            break
        }
    }
    if (i == this._immigrating.length) {
        this._immigrating.push(immigration)
    } else {
        this._immigrating[i].properties = immigration.properties
        this._immigrating[i].cookie = immigration.cookie
    }

    // Do nothing if our container indicates that a decision has been reached.
    return this.decided ? null : this._immigration()
}

// Geneate an immigration government if we have an immigration available.

//
Shaper.prototype._immigration = function () {
    if (this._immigrating.length) {
        var immigration = this._immigrating[0]
        return {
            quorum: this._government.majority,
            government: {
                majority: this._government.majority,
                minority: this._government.minority,
                immigrate: {
                    id: immigration.id,
                    properties: immigration.properties,
                    cookie: immigration.cookie
                }
            }
        }
    }
    return null
}

module.exports = Shaper
