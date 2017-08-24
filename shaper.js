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
    this._unreachable = 0
    this._population = government.majority.length + government.minority.length + government.constituents.length
    this._seatsAreEmpty = government.majority.length + government.minority.length != this._parliamentSize
    this._seen = {}
    this._minority = []
    this._exiles = []
    this._expandable = []
    this._immigrating = []
    this.collapsed = false
    this.decided = false
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

    var seen = Object.keys(this._seen).length

    // Majority members are not our resposibility. They trigger their own
    // collapse.
    if (~this._government.majority.indexOf(id)) {
        return null
    }

    // If the citizen is a minority member we look for impeachments. Also, we
    // want to take certain actions only after we have ensured that the the
    // government is as healthy as it can be.

    //
    var minority = ~this._government.minority.indexOf(id)
    if (minority) {
        if (reachable) {
            this._minority.push(id)
        }  else {
            // If minority member is not reachable we impeach it &mdash; remove
            // it from the government &mdash; immediately.
            return {
                quorum: this._government.majority,
                government: {
                    majority: this._government.majority,
                    minority: this._government.minority.filter(function ($id) {
                        return $id != id
                    })
                }
            }
        }
        // If our minority is present and correct we might release an exile if
        // one detected one, but we'll keep looking for a citizen to fill an
        // empty seat if a seat is empty.
        if (
            this._minority.length == this._government.minority.length &&
            (this._seatsAreEmpty || seen == this._population)
        ) {
            return this._exiles.shift() || null
        }
        return null
    }

    // The citizen is not a minority member.

    //
    if (reachable) {
        if (this._seatsAreEmpty) {
            // Our government has empty seats and we have found a citizen we can
            // appoint to the minority. This appointment can take priority over
            // any impeachments so let's go.
            return {
                quorum: this.government.majority,
                government: {
                    majority: this.government.majority,
                    minority: this.government.minority.concat(id)
                }
            }
        } else if (this._shouldExpand) {
            this._expandable.push(id)
        }
    } else {
        // Count as unreachable.
        this._unreachable++

        // If the reachable population is less than the size of our current
        // government we need to shrink the government size.
        //
        // This allows us to move to a more survivable state. A five member
        // government, for example, can survive two failures. If a five member
        // government has only four members, however, it can only survive one
        // failure and with only it's majority of three it cannot survive any
        // failures. Shrinking to a three member government means those three
        // members can survive one failure.
        var parliamentSize = this._government.majority.length * 2 - 1
        if (parliamentSize > this._population - this._unreachable) {
            var majority = this._government.majority.slice()
            var minority = this._government.minority.slice()
            minority.unshift(majority.pop())
            if (minority.length == majority.length) {
                minority.pop()
            }
            return {
                quorum: this._government.majority,
                government: {
                    majority: majority,
                    minority: minority
                }
            }
        }

        // Record the unreachable citizen as a potential exile.
        this._exiles.push({
            quorum: this._government.majority,
            government: {
                majority: this._government.majority,
                minority: this._government.minority,
                exile: id
            }
        })
    }

    // If as seat is empty we're going to wait for a citizen to fill those seat.
    if (this._seatsAreEmpty && seen != this._population) {
        return null
    }

    // TODO Is the quorum the new majority or the old majority?
    // TODO Think about growth commit race conditions again.

    //
    if (this._government.minority.length == this._minority.length) {
        if (this._shouldExpand && this._expandable.length >= 2) {
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

        // Otherwise let's exile someone if we have someone to exile.
        return this._immigration() || this._exiles.shift() || null
    }

    return null
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
        this._immigrating[i].properties = properties
        this._immigrating[i].cookie = cookie
    }

    if (this.decided) {
        return null
    }

    // If as seat is empty we're going to wait for a citizen to fill that seat.
    if (this._seatsAreEmpty && Object.keys(this._seen).length != this._population) {
        return null
    }

    if (this._government.minority.length == this._minority.length) {
        return this._immigration()
    }

    return null
}

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

Shaper.prototype.createShaper = function (paxos) {
    var shaper = new Shaper(paxos.parliamentSize, paxos.government)
    for (var i = 0, immigration; (immigration = this._immigrating[i]) != null; i++) {
        shaper.immigrate(immigration)
    }
    return shaper
}

module.exports = Shaper
