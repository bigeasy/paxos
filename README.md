In-memory Paxos in pure-JavaScript. No disk writes necessary.

Sketch of what to say.

 * Reproducable events for unit testing, but still a true Paxos.
 * In-memory so that no disk writes are necessary.
 * Blindingly fast.
 * Write a proof that shows how this variation works.

**TK: Documentation.**

## Diary

Concerns and Decisions:

 * Work on making this algorithm ever more deterministic and replayable, so that
 we can run test this using a pseudo-random number generator.
 * What needs to be most deterministic is the pulse, can you make it so that you
 can replay the actions of each member of a government individually, so that you
 can log and replay the actions of each individual member?
 * How does a participant in the island know that they have become isolated?
 I've given a lot of thought to how a government would vote a participant off
 the island, but no thought to how a participant would know that they have been
 ostracized. (The metaphor gets sad over here.)
