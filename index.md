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
