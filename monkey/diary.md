## Thu Apr  4 10:11:43 EDT 2019

Our Paxos is synchronous and deterministic. There are two initialization
methods. `bootstrap` creates an initial leader on an island that has only one
member, `join` initialized the member to join an existing island.

There is a government structure inside the `Paxos` object. That is our
government that says who is in government, who among our legislators are in the
majority or the minority, and who are constituents. You should complete a
bootstrap and then dump that structure to have a look at it.

The `test/network.js` is a go by for a pseudo-network. It keeps `Paxos`
objects in a `denizen` array. The network address is an index into the array.
An array is fine. Just reuse in index when that `Paxos` dies and leaves. It
simulates an instance restarting on the same machine and having the same
identifier rejoining if you use the same identifier in the monkey (the index.)

Messaging is done by `Paxos.outbox`, `Paxos.reqeust`, and `Paxos.response`. In
`test/network.js` you'll see a message loop. You shift the next message off of
`Paxos.outbox` and then give the message to each member addressed gathering up
the return values of calls to `request` into a response object. (Note that in
`test/network` I've wrapped the calls to `Paxos.request` in `Denizen.request`,
look closely.)

Then the responses are given to `Paxos.response`. There is no return value from
`Paxos.repsonse`. Any decisions are expressed by pushing a message into the
`outbox`.

In addition to message passing there are timer events. `Paxos` does not run a
timer itself. It uses Happenstance that will run a timer in production, but for
testing we want to simply pump the Happenstance events into `Paxos.event`.
Instead of running a timer, call the `check` method passing a POSIX time which
is going to be a simulated current time.

All calls to `Paxos` will have a `now` parameter. That is the current POSIX
time. `Paxos` will not check the time itself. For the monkey you'll manage a
clock which is simply an integer that you're incrementing to simulate the
passage of time.

Finally, there is `embark`. After you've called `Paxos.join` on a newly created
`Paxos`, you're going to call `Paxos.embark` on the leader. The cookie can be
the time, the properties should include a `location` property that we've said is
an index into an array of participants. `acclimated` is false, because we want
to test `acclimation` (and `acclimated` true turns out to be a mis-feature.)

`test/network` should give you a lot to go by and stepping through the big
`test/paxos.js` for the first few test should show you how bootstrapping and
joining works.
