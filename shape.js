// Unreachable will never be corrected, but we don't track that here. We create
// a new shape for each government, then prime it with what we already know.

// Could think harder about priorities as they releate to healing. Wouldn't want
// to starve the recovery of the cluster by performing immigrations only, when
// newly naturalized citizens could join the legislature and preserve the
// republic.

// Note that I currently favor impeachment because the minority updates the
// constituents. A non-functioning minority member keeps all constitutents in
// the dark.

// Then I favor shrinking the government as soon as it becomes obvious that the
// government size is less than the population of the island.

// Exile occurs immediately.

// All this assuming an external mechnism for tracking pings that will calculate
// when a paricular participant is reachable or unreachable. After `update`
// returns a reshape operation, the `Shape` object is consumed. At that point
// you should no longer call `Shape`. Put a dummy shape object in its place.

// A new `Shape` object should then be created when a new government is created.

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

//
function Shape (parlimentSize, government) {
    this._shouldExpand = parlimentSize != government.parlimentSize
    this._parliamentSize = government.majority.length * 2 - 1
    this._shouldShrink = government
    this._government = government
    this._unreachable = 0
    this._expected = government.minority.length + government.constituents.length
    this._population = government.majority.length + this._expected
    this._parliament = government.majority.concat(government.minority)
    this._unhealthy = this._parliament.length != this._parliamentSize
    this._minorityPresent = 0
    this._shapes = [[], [], [], []]
    this._seen = {}
    this._minority = []
    this._exiles = []
}

Shape.prototype.update = function (id, reachable) {
    var seen = !! this._seen[id]
    if (reachable && seen) {
        return null
    }
    this._seen[id] = true
    var minority = ~this._government.minority.indexOf(id)
    if (minority) {
        if (reachable) {
            this._minority.push(id)
        }  else {
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
        if (
            this._minority.length == this._government.minority.length &&
            this._expected.length == this._government.minority.length &&
            this._parliament.length > 1
        ) {
            var parliamentSize = Math.floor(this._parliament.length / 2) * 2 + 1
            var majoritySize = Math.ceil(parliamentSize / 2)
            if (this._parliament.length % 2 == 0) {
            }
        }
        var exile = this._exiles.shift()
        if (exile) {
            return exile
        }
        return null
    }
    if (reachable) {
        if (this._unhealthy) {
            return {
                quorum: this.government.majority,
                government: {
                    majority: this.government.majority,
                    minority: this.government.minority.concat(id)
                }
            }
        }
    } else {
        this._unreachable++
        var parliamentSize = this._government.majority.length * 2 - 1
        if (parliamentSize > this._population - this._unreachable) {
            var majority = this._government.majority.slice()
            var minority = this._government.minority.slice()
            minority.unshift(majority.pop())
            return {
                quorum: this._government.majority,
                government: {
                    majority: majority,
                    minority: minority
                }
            }
        }
        this._exiles.push({
            quorum: this._government.majority,
            government: {
                majority: this._government.majority,
                minority: this._government.minority,
                exile: id
            }
        })
    }
    if (Object.keys(this._seen) == this._expected) {
        throw new Error
    }
    return null
}

module.exports = Shape
