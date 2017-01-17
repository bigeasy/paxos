A replayable, deterministic implemenation of Paxos.

Sketch of what to say.

 * Reproducable events for unit testing, but still a true Paxos.
 * In-memory so that no disk writes are necessary.
 * Fast because it

A consensus algorithm will maintain a log between multiple machines, and
consensus is reached when a majority of the machines agree on an entry in the
log. The log is eventually consistent, meaning that the participants will learn
about the values eventually, but they will always learn about events in the same
order, so you can use this log to implement synchronization.

Paxos Made Simple, Again

If you simply want to get Paxos running, use
[Compassion](https://bigeasy.github.io/compassion). It is an implementation of
an atomic log using Paxos. From there you build your replicated state machines
and what have you.

This is the implemenation of Paxos. It is less than TK lines of JavaScript code.

The main class of the Paxos library is the `Legislator`. This is an active
participant in the Paxos algorithm. (Should it be `Citizen`? Should it be just
Paxos?)

```javascript
var i = 0;
```

Nodes on `Legislator`.

`Legislator.citzens` ~ An object used as a map of properties of the citizens
of the island.

`Legislator.government` ~ The structure of the goverment with an array of
majority members, an array of minority members and an array of constituents.

`Legislator.outbox()` ~ Returns the next outbound pulse.

`Legislator.sent(TK)` ~ Reports the results of a pulse.

## Notes

We can add an integer counter to the nodes. Integer so that it is fast. It will
have to wrap. This makes for a size limit of 4,294,967,296. Limits are
disheartening, but visibility means that we'll be able to be aware of the limits
and set alarms before those limits are reached.

The limit is due to the fact that counter will wrap to keep it within 32-bits,
which is fast. We could benchmark comparisons with floats and integers and see
if we're willing to not care.

We introduce the concept of heft to Procession so that developers can assign
their own limits.

The counter wraps. Hence the limit. That is the limit of the queue's contents,
not the limit of the queue's lifetime traffic.

Synchronous iteration is done with a simple linked list iterator. Perhaps I
invite the users to iterate on their own with nodes. Then they can promote the
nodes to consumers.

Iterators can be manipulated directly. They can be promoted to consumers. They
are not tracked like consumers. Instead, we mark the nodes as `shifted` when
the last consumer shifts them. We assert that a node is not shifted when our
dear user upgrades a node to a consumer.

With this number we can have visibility, counting the maximum held in the queue.
We can also have optional search. Actually, both heft and search can be
implemented using a listener object that has a method for adding and removing
a node.
