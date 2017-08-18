A replayable, deterministic implemenation of Paxos.

Sketch of what to say.

 * Implements an atomic log and/or atomic broadcast.
 * Reproducable events for unit testing, but still a true Paxos.
 * Paxos itself is in memory so that there are no disk writes.

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

## Notes

Removed a note about using integers instead of `Monotonic`. Every time there is
a government change you get another four billion or so transactions. Holding
onto `Monotonic` because it amuses me to think that the consensus algorithm
would outlive 64-bits. Adds a big integer dependency to a C implementation.

Could be an exercise in letting go to do away with `Monotonic`. Ah, but I use it
everywhere and in the down streams as well. That the promise is a string is
useful and the self-documentation is useful, that you can see the change in
government, etc.

It is difficult sometimes to see the dependencies that get created for something
as simple as a format.

## Paxos

 * The proposers also act as learners. They are the first to determine when a
 round can be committed, they are the first to determine that a commit succeeded
 and a new government has been established.

### One or more acceptors issues new promises before commit

After the proposer has written an accept message to all the acceptors, but
before it can write a commit message, one or more of it's acceptors issues a
subsequent promise to another proposer. The proposer will have committed its own
accept write to the log (TODO wondering of accept should just stage a write to
the log instead of having its own register.) When the proposing citizen commits
it will establish the new government, but it will immediately mark it as
collapsed.

Hmm... Committed and collapsed. If the proposer can do it, then the acceptors
can do it as well. We would push the commit and why not just push it as a sync.
That is, commit in the proposer, then sync the proposal using the constituency
mechanism?

Then the acceptor that has issued a new promise will commit to the log, so...

### One or more acceptors has write and issues a promise

An acceptor returns a promise with its register value which is a government
proposed by another proposer. The proposer creates a government with the value
of this government as the previous entry. The other proposer was able to write
to all of its acceptors so it commits its entry and syncs with its acceptors.
This commits the value, but the other proposer sees that its acceptors have
issued new promises so everyone marks the government as collapsed.

The proposer writes its values and in doing so syncs to get the other proposers
committed government and notes that it is collapsed because it is coming back on
the accept message. So, being collapsed simply means that the proposers keep
going, so they stop when they are able to form an uncollapsed government.

The other proposer knows that it is collapsed, because it sees the new promises.
Our proposer knows it has collapsed because we are going to have synced records
but they sync on our write.

If there is no commit message, however, the other proposer has written, but we
get our writes in before it commits, then our proposer commits and when it does,
it will create the government it received as written when it proposed. This will
be the government committed by the other proposer.

Now we have another race. A commit versus commit race. Both proposers have
successfully written, successfully committed, but one is ahead of the other.

So, if the other one goes to commit, it will succeed but the government will be
already collapsed because there will be new promises out on the acceptors.

If we succeed, then there is no reason for the other proposer to fail.

### One or more acceptors has a commit on commit

When we commit our commit it will already have been committed. In fact, during
the sync step we're going to get a new government. That new government is going
to be greater than ours. It should be possible for the proposer to know that
this new government is not collapsed.

If there are other acceptors that have not received a commit, we will get follow
the protocol that when our commit message commits to an acceptor that has made
subsequent promises we mark that government as collapsed. RULE We wait for a
pulse to complete before we determine the next action. Because we wait for a
pulse to complete before determining the next action, the subsequent government
will get synced and it will not be marked as collapsed.

TODO Add a flag to sync so that we can determine if the government should
collapse.

### Proposer is halted by its acceptor

What happens when a citizen that proposing receives a proposal and issues a
promise, but is in the midst of its own proposal? The synchronous response would
come at the end of a network request. The response can find that the proposer
has been destroyed.

### Life cycle of write chain

We are building a write chain, which I'm not discussing. Actually, in order to
discuss it I need to discuss the log and the write register.

Worth noting that when a proposer knows that an accept round has failed it will
not add the government it knows it failed to the write chain. However when
another proposer receives that write from an acceptor as part of a promise, it
is not going to know if the write succeeded or not, it will add it to the chain
regardless. Different proposers can have different write chains.

Starting from out initial state, we might have an uncommitted write in our log.
Our proposer creates a government that has the uncommitted write as at the end
of the chain, another proposer that has no uncommitted write will start with
itself at the end of the chain. If our proposer receives a promise after the
other writes, we would put that write as the chain following a new government
and that would discard the uncommitted write we started out with.

TK Come back and finish this. Where we discard our proposed government and it's
chain and build a chain using another proposer, but fail. It makes progress
fails. We start again with a chain that includes the original chain that we
discarded. (Can we log this? Can we log the more interesting consensus
problems.)

In fact, we could start a write round and write our chain to one acceptor but
find that another has issued a promise to the other proposer and accepted a
write. We then begin a new proposal and get to accept with a new government
whose chain would begin with the other proposer's write at the end of
the chain, we would discard out government. We write to one acceptor but the
other proposer makes progress

The only way to get an interleaved write is by first getting a quorum of
promises, however it only takes one promise to wreck the write for the other
proposer. To get interleaved writes you need to, well it's not that hard. You
get a quorum of promises, but someone else gets a quorum of promises that has
some overlap. The overlapped proposer will have some successful writes whereas
the overlapping proposer will have all successful writes.

### Selecting a chain

Two proposers. One gets a quorum and manages to write to one acceptor, but
another proposer gets a quorum preventing the first proposer from finishing. It
writes to an acceptor when a third proposer gets a quorum. In that quorum the
third proposer sees two different written values, so which done does it select.
The subsequent one. The one with the greater promise.
