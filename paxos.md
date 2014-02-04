Replicating state machines is a way of distributing a fault-tolerant service to
a number of clients, with each replica maintaining a state consistent with the
others. Fault tolerance is achieved by having a number of replicas with the same
state, allowing a number of them (maintaining 2N+1 replicas where N = number of
tolerable failures) to experience any sort of failure without affecting the
remaining system.

Replicas should be able to rejoin the proceedings after a failure, which means
they will require an input log to repeat inputs in the correct order and reach
the correct state (determinism assumed, of course), or a recent known state held
by the cluster and the inputs since that state. It is assumed that all replicas
should keep some sort of log; the system is not very fault-tolerant if all of
them do not. In terms of paxos, it makes sense for all nodes except clients and,
in some situations, learners, to log their recent state and inputs. Otherwise,
clients and learners are solely interested in outputs.

Paxos is a protocol that allows a system of fault-tolerant machines to reach a
consensus. A leader is required when two or more machines cannot reach an
agreement on the next operation, such as when two proposers are continually
racing each other. Thus, a Paxos implementation requires *some* algorithm that
will always eventually decide on a leader. These things also allow Paxos to
continue working when a number of machines have failed; as long as a leader is
chosen among the remaining, working machines, inputs will continue to be
processed and failed machines can join at a later time. Although only one
machine is actually required to continue processing inputs (assuming it can fill
the roles of both proposer and acceptor, an option all nodes should have),
although fault tolerance will of course not be restored until at least three
machines are running.

There are a number of small optimizations that can improve the speed of Paxos
rounds in different situations. For example, if reaching consensus is expected
to take a while but network latency is not an issue, that round can be sped up
by sending denial responses to failed promise requests instead of ignoring them.
There are also a number of ways to distinguish groups of nodes that can make
each node's job simpler. All learners, for example, could be grouped together
with a single learner determined leader. Thus, all acceptors only need to send
accepted values to one learner. As long as there is an algorithm in place to
choose a new leader for the cluster of learners and notify the acceptors, rounds
can continue as soon as that leader has stored the output of the last round and
the other learners can be updated as the next round continues.

Storage is handled by acceptors, the number of which is always at or below a
pre-determined amount (i.e. adding new acceptors mid-process is not possible in 
libpaxos). This restriction makes sense to me because adding a new
client/learner or proposer only requires configuring that new node or, at most,
that node and one other; adding an acceptor means all other acceptors and
possibly some proposers will have to be updated. However, this does not mean a
failing acceptor can't be swapped out; as long as the working number of
acceptors does not rise beyond the amount at start, the algorithm should work as
expected. Each acceptor has a unique identifier between 0 and N-1 where N =
number of acceptors *at start*. Thus, a proposer doesn't need to be able to tell
which acceptors are currently active before sending a proposal, although
obviously it would know which ones are up/down based on responses received.
Still, conceivably a failed acceptor could be replaced at any point with a new
acceptor using the same identifier and participate in the next round*** of
proposals.

I'm assuming, because this makes the most sense to me (but, isn't that what an
assumption is?), all proposals or proposed messages are sent through UDP and
that promises are TCP connections. So, a client with a message to broadcast
would send it through UDP to the nearest or most practical or only proposer, who
would then begin firing UDP numeric proposals to the acceptors. Once an acceptor
makes a promise to that proposer, the proposer sends the message via TCP. if the
acceptor receives a higher numeric proposal before the message comes through,
the TCP connection is broken. This is better than sending a response  back to
the proposer because the proposer's behavior should continue in the same manner
whether an acceptor goes down or not. It doesn't matter *why* the connection
broke; it did, which means back to sending proposals.


***It's unclear, with so many sources, what the exact terminology is. I like the
word 'round' to describe the period in which proposals are sent/promises are
made, with each round ending in a decision being made about the next state. I
use 'process' to describe a series of rounds, with a clear start and end -
ending the process means shutting every node down, reconfiguring, whatever.
