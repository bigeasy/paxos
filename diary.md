http://research.microsoft.com/pubs/64634/web-dsn-submission.pdf

http://stackoverflow.com/questions/5850487/questions-about-paxos-implementation/10151660#10151660

- stateLog format: round number as key, returns object with time, value, current leader
    - switched to using Date object as key and including round number in the object

- don't forget. Node processes not root - port 1024 & up

- TODO:
    config file for entire instance, not just single node
    should be able to join networked instance from config.
    possibly give each node a cluster object to store instance info
    need to reconfigure callbacks. Ask Alan during his refactor.
    talk to Alan about Proof so that tests will pass.

If multi paxos is optional, remember to finish packet work before closing socket


## Glossary

 * Proposal ~ The first stage of a round of Paxos.
 * Decision ~ The second stage of a round of Paxos.
 * Round ~ A round of Paxos in any state from proposed, to decided, to decreed.
 Entries in the log are called rounds. A round it identified by it's promise id.

## Naturalization

Naturalization is triggered by an internal message to add a legislator to the
island. A legislator will submit a naturalization message to the leader. The
leader will add the naturalization message to the queue, then run it through a
round of Paxos. When the naturalization is enacted, the leader will immediately
create a new government with the existing structure that includes the legislator
as a constituent. The constituent legislator will then begin to receive messages
to update it's log.

The first message to a legislator must be the convene message that describes the
government that includes newly naturalized legislator. The legislator will
reject with any message it receives prior to receiving the government that
enacts it's naturalization. The naturalization is indicated by a property of the
government message that indicates that the government was formed explicitly to
naturalize a particular legislator.

Thus, the legislator submits a naturalization message and then waits to received
the beginning of a log in which it is naturalized. This is ideal operation, with
no lost messages.

(I'm at the point where I am having a hard time believing that naturalization
could be as simple as this, so let's look at the failure states.)

Two things can disrupt naturalization.

First, the naturalization message could be lost, it might never make it through
a round of Paxos. This is the case for all messages submitted to the parliament.
We mitigate this by submitting naturalizations using the timer, backing off the
timer the longer we wait, and clearing timer when the legislator receives it's
first message.

Thus, we have to convince ourselves that duplicate naturalization messages are
benign. They are. If we receive a naturalization message with the id of
legislator that has already naturalized we do nothing, we do not form a new
government.

Second, we might not be reachable. We might be able to submit our naturalization
message, but we might not be able to receive log synchronization. In this case,
we'll be naturalizing our legislator by submitting our naturalization messages,
but then our legislator will be exiled when our log synchronization times out.

You might imagine a race condition here, but I can't find one. You might imagine
that there is a trashing taking place, but if the timer backs off far enough, it
will be a reasonable amount of network traffic.

The only truly painful bit would be if the new legislator triggers an election,
so an optimization might be to wait for the new legislator to synchronize before
trying to use it in an election. This is quite a bit of complexity to add at
this point for an edge case. Actually, parliament grown elections are always
called by the leader, so the leader can call that election with a remap and keep
from resetting the submissions.

Wow, as I'm typing this, I'm realizing that the optimal implementation, the
easiest, and the one that removes the need to ping prior to an election is to
return the status of constituents in the pong message. Yes, still need to ping
during a snap election, desperate times call for desperate measures.

But, maybe the ping can be more naive? Like, instead of adding things one at
time back to pinged, you have a function that takes what's available and tries
to form a government with it.

Whoa. What is the point of this massive ping at election time? Slows things
down, doesn't it. Majority members should immediately begin to ping all of
parliament, with a retry of one, but continue to ping when retry is zero, so now
ping is on or off, this will update the status of the majority.

Then anyone tries to reform the government with the same members, but with a
majority that can sustain a pulse. This is much simpiler than trying to build a
government at election time. Government building can be a separate function,
more on this later.

Once the government can sustain a pulse, the dead members are in the minority.
They are exiled and the parliament shrinks immediately. Thus, you can go from a
five member parliament to a three member parliament, and if you do it quickly
enough, you might be able to sustain another hit.

Once exiled.

TODO: Okay, so here's a race condition for you, imagine you have a majority
member that is isolated long enough to be exiled, but then returns. It then
starts blasting the parliament with bogus messages. We need to make sure that
these messages are going to get rejected, and rejected as; no you can't form a
government because you are not in my previous government. This would case the
legislator to realize it has been isolated and exiled so that it can then focus
on being tremendously sad.

Once exiled rebuild the government from the pong messages. When we get back
pongs from a healthy constituent, we reform the government with the healthy
constituent as a minority member.

Thus, we're driving our elections from health data, not opportunistically. This
goes and takes care of the problem of ruining the parliament by trying to elect
a newly naturalized citizen that can't actually communicate as a citizen, only
as outsider.

What kept me from seeing this is that I didn't want to have all this stuff
coming back on the pongs, that seemed like too much traffic, but we'll live.

If the message lost, the legislator will wait forever for log synchronization.

Naturalization begins by starting a naturalization timer on an empty client. The
time generates a naturalization message and submits it to the leader. The
message includes the id of the legislator, the location information for the
legislator, plus a UNIX epoch timestamp generate by the legislator. The
timestamp is used as a cookie to identify the specific
