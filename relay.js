// We identify our representative by immigration promise instead of name on the
// off chance we've been isolated for so long that our representative not only
// restarted but also managed to rejoin parliament and resume it's position as
// our representative.

// See `createRelay` below for more thoughts.

// TODO Come up with a name for this, name and immigration?

//
function Relay (representative) {
    this._representative = representative
    this.outbox = {}
    this._seen = {}
}

// Our outbox is sent on the ride back from a request. We are the constituent,
// they are the representative. Information flows from representative to
// constituent, for the most part, while this is the feedback that will
// eventually make it to the leader.
//
// When our representative gets the contents of our outbox in the response, it
// will make note of it send a receipt on the next pulse. If for some reason
// this receipt is lost we'll end up sending the same outbox again &mdash; maybe
// with more or updated entries.

// The duplication is not a problem. Denizens only ever move from reachable to
// unreachable, the value of the top of their log only ever increases.

// A receipt takes the same form as our outbox.

//
Relay.prototype.received = function (receipt) {
    for (var name in receipt) {
        // We only remove an item if we know that our representative has the
        // same value that we have.
        if (
            this.outbox[name] != null &&
            this.outbox[name].reachable == receipt[name].reachable &&
            this.outbox[name].committed == receipt[name].committed &&
            this.outbox[name].naturalized == receipt[name].naturalized
        ) {
            delete this.outbox[name]
        }
    }
}

// TODO Come back and write about this. We are updated by our pinger and by our
// constituents, that is we may be actively determining reachablity of some
// denizens, accepting feedback about others.

//
Relay.prototype.update = function (name, reachable, committed, naturalized) {
    if (
        // We always update our outbox if we nothing going on at all.
        (
            this._seen[name] == null
        ) ||
        // Otherwise if the denizen is currently reachable, then we update our
        // state if the denizen is now unreachable or if its maximum committed
        // promise has changed.
        (
            this._seen[name].reachable &&
            (
                !reachable ||
                this._seen[name].committed != committed ||
                this._seen[name].naturalized != naturalized
            )
        )
    ) {
        this._seen[name] = this.outbox[name] = {
            reachable: reachable,
            committed: committed,
            naturalized: naturalized
        }
    }
    return null
}

module.exports = Relay
