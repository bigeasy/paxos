In-memory Paxos in pure-JavaScript. No disk writes necessary.

Sketch of what to say.

 * Reproducable events for unit testing, but still a true Paxos.
 * In-memory so that no disk writes are necessary.
 * Blindingly fast.
 * Write a proof that shows how this variation works.

**TK: Documentation.**

### Diary

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

### Decided versus Uniform

Do we need to decide matters or mark them uniform before we can act on them. I
believe that we should only act as clients when we mark uniform, but we do need
to not always be uniform when acting as parliament. The majority can catch up by
sending synchronization messages in the pulse.

Oh, but there is the guarantee that we can recover, and we are diskless, so no,
wait the point is that so long as no one learns besides our majority, it doesn't
matter. Only when we mark uniform do we teach the minority, so we can form new
governments using a pulse, get caught up during the pulses, and we're not going
to wait too long anyway.

### Diskless Paxos

Some thoughts on the process of deciphering Paxos. Thoughts on why it has become
notorious when it is really very simple.

The Paxos algorithm as it is described in most places makes it sound like Paxos
tames chaos, allowing any participant in a parliament of any size propose a
change in state. There is talk of proposers, acceptors and learners, and then
lots of discussion of who can be what, the many different ways in which you can
configure these three roles. But these three roles are not interesting. The only
really interesting thing is process of deciding on a round of Paxos, and whats
interesting are the messages passed, not the roles of the participants.

What's more, these roles, proposer, acceptor and learner are accompanied by a
lot of talk of which participants should be what sort of role, which
participants should share these roles, and so on. There is talk of how there
could be a leader, but the reality is that there absolutely must be a leader, or
else you are always in a race condition. For the most part, you only use the
mechanics of Paxos to deal with the loss of a participant.

I use chaos monkey to simulate that loss in my Paxos, but I understand that
actually having to decide between two proposals is a major event and the crux of
the implementation.

In reality, these roles of proposer, acceptor and learner are fixed. Any change
to these roles is a big deal. If they change too quickly, the implementation
becomes impossible to trust. There is only so much complexity that working
programmer is willing to absorb in an are where said programmer has already
decided that replication, that is durability and consistency, is critical.
*TK: Wha? English please*

The Paxos algorithm insists that acceptors write to disk to recover from a
crash, but why trust a disk? They fail. In today's hosting environments networks
are the focus, not disk. Machines are cheap. The come in and out of service
quickly. They are disposable and their persistent storage reflects that
disposability. I'd rather that a crash-stop meant we relied on the replication
built into Paxos. I'd rather wait for two network calls to complete than for a
disk to flush, especially when that disk flush is itself going to be a network
call to storage area network.

Thus, this is a Paxos that is both practical and inflexible. When one reads the
Paxos literature, one gets the impression that a good Paxos library would allow
you to have Paxos, multi-Paxos, fast-Paxos, this-Paxos and that-Paxos. A good
Paxos library would would UDP as easily as TCP, you could stream or multicast,
or if you are using a particular network protocol with particular guarantees, it
would be bad form to rely on the those guarantees. You imagine that a good Paxos
library should scale, adding participants, and the different roles are all
abstractions, and everything is dynamically adjusting itself.

The literature makes leadership seem like a nice to have. You could do this, you
could do that, as if these architectural decisions would be made a run time.
Certainly not by the Paxos library, it should be a garden of algorithmic purity.

But, you cannot express Paxos as a library. It needs to be expressed as an
implementation. That's what this is.

To explain Alan's Paxos, we use the parliament analogy. (I'm an American, we
have no parliament, so feel free to correct my analogy where it goes wrong.)

We will call the system Alan's Paxos. If you have a better name, please suggest
it. It will be rejected.

An instance of the system is a Paxos.

Alan's Paxos can be used in two configurations. It can be used as a primary
application, building a service like a lease service. It can be built on top of
an existing service, used to create an atomic broadcast log for control messages
on an internal network.

Alan's Paxos is not a Byzantine Paxos. You must trust your participants.

To describe Paxos we return to the Lamport analogy of the legislature, but we
are going to speak more plainly. Some of what we say is almost as
tongue-in-cheek as the original Lamport paper, but not quite.

As you might know already, a consensus algorithm will maintain a log between
multiple machines, and consensus is reached when a majority of the machines
agree on an entry in the log.

Let's just call a running instance our system an **community**. A computer
participating in our **community** is a **citizen**. A computer requesting
something of our **community** is outside of our analogy, so we'll call it a
**client**.

Our **community** has a **parliament** where **decisions** are made. The
**parliament** produces a **log** of it's **decisions**. Each **citizen** has a
copy of the **log**. Each **citizen**'s copy of the **log** is always identical,
with the same decisions in the same order. Some **citizens** might not have the
full **log**, but the decisions that they do not yet have they will have
eventually.

A **citizen** can be member of the **parliament**. In this case, the **citizen**
is called a **legislator**. A **parliament** can have as few as one and as many
as five **legislators**.

A one **legislator** **parliament** does not provide redundancy or durability.
It is permitted so that our **community** can bootstrap, staring with one
**citizen**, then adding others as part of start up procedure. We may even
decide to leave it at one **citizen** if all we're doing is running a unit test,
or hacking on development copy of our application. We can use the algorithm as
part of our control flow during development, knowing it will be durable when
we're ready to go into production.

With a **parliament** of five **legislators**, two can fail without losing data
or stopping operations. With a **parliament** of three **legislators** one
machine can fail without losing data or stopping operations. Our implementation
can downgrade, so that a **parliament** of five **legislators** can lose two
**legislators** for good without losing data, then reconstitute as a
**parliament** of three **legislators** and lose yet another **legislator** for
good without losing data.

Our **legislator** makes **decisions** for all the **citizens**. Before
**citizens** learn about **decisions** a majority of the **legislators** in the
parliament will have written the **decision** in their **log**. Until a majority
of the **legislators** in **parliament**, no **citizen**, neither **legislator**
nor **constituent** will take action on that **decision**. Thus we have
**decisions** and we have **actionable** **decisions**.

The distinction is how we run without a disk. A **citizen** does not take action
on a **decision** that has not been logged by a majority of the **parliament**
because that decision may be forgotten by **parliament**. Which brings us to
another point.

A **legislator** cannot copy the **log** of a **constituent**. If a
**constituent** becomes a **legislator**, then they can use their **log** in
their duties as a **legislator**, but the **parliament** cannot use the
**constituents** logs as backup. *Ed: Not an important point. Talk about
legislative authority and message flow.*

Our **parliament** will have a **leader**. The **leader** is a strong
**leader**. The **leader** will guide the entire operation of the
**parliament**. The other **legislators** will only ever replace their
**leader** if they can no longer reach their **leader**.

State is changed by making a **proposal** through the **leader**. Any
**citizen** or **client** wanting to change state will do so by submitting a
**proposal** to the **leader**. The **leader** is the bottleneck in this regard.
There is no attempt to spread the load among the **legislators** in the
**parliament**. That's not why we have multiple machines participating in our
**community**. It's not for load balancing, it is for durability. *Ed: Great
point. I can't believe I was smart back then.*

If a **citizen**, any **citizen**, **legislator** or **constituent** wants to
change the state, they make a **proposal** to the **leader**. A **client** is
allowed to do the same. In this sense, anyone wanting to make a change is really
just a **client**.

So, a **client** needs to find the **leader**. They do so by asking any
**citizen**. The **citizen** will direct them to the leader. The **citizen**
might not know the latest leader, so the **client** might get shuffled about,
with redirects and not founds, but the **leader** is there and the **leader**
can be found, eventually.

The **leader** will remain **leader** for as long as possible, so under happy
circumstances **clients** will not have to search for the **leader** frequently.

*Ed: Actually, we like to break up the record by having periodic elections for
no reason, but things are generally durable, yes.*

Now let's let you in our how Alan's Paxos works. We'll first look at normal
operation with an established **leader**. Then we will talk about how a
**leader** is chosen and how **citizens** become **legislators**.

If you don't know the basics of multi-Paxos, I'll wait while you go off and read
one of the many overviews of Paxos and multi-Paxos. Get to the point where you
say to yourself, "This is really simple, what's the big deal?", followed by,
"Wait, what about..."

The Paxos literature does not get into a lot of detail about the structure of
what we're calling a **parliament**, making it seem like it's just as good an
idea to have all the **legislators** trying to shout over each other, each
proposing and counter-proposing the next round of Paxos. While this might be
healthy in a real democracy, it is not very healthy in our consensus algorithm.

If you've read your Paxos literature, you know about **proposers**,
**acceptors** and **learners**. You also know that with a **leader**, you can
use the same **proposal** id again and again on new instances, skipping the
initial exchange of **propose** and **promise** messages.

All of our **legislators** can perform the roles of **proposer**, **acceptor**
and **learner**.

Who plays what role is what makes this Alan's Paxos.

A reminder that the examples here assume a **parliament** of five
**legislators**. You can use any odd number greater than two.

We use multi-Paxos. Our established **leader** will form a **government** with a
majority of **legislators**. Within a **government**, the **legislators** in the
majority will all act as **proposers**, **acceptors** and **learners**. The
**legislators** in the minority will act as **learners**. Our **leader** can
form any government it sees fit, choosing any of the available **legislators**
for its majority.

The choice of the **majority** is arbitrary in the current implementation of
Alan's Paxos.

When the **leader** begins a new **government** with a **proposal** to the
**majority**. When it receives **promises** from the **majority** it can then
start to send **accept** messages on behalf of **clients**.

How does it send these messages? We send them in bulk, in a checksummed
transcript, using HTTP/S. That's how messaging is performed in Alan's Paxos. The
transcript is sent in the body of a `POST` a single HTTP/S end point for each
**citizen**.

You know HTTP/S, so we don't have to talk about it much more, except to say that
although we have actors and we've taken care in naming them, we are not
manipulating objects so we are not going to contort our application to fit
RESTful endpoints. No `PUT` **legislator** or `DELETE` **majority**. Just a
`POST` of our checksummed transcript that we want our Paxos implementation to
`PLAY`.

Because we're using HTTP/S `POST`s we're going to build on what you know to be
true about HTTP/S `POST`. Key to this is that when you get a `200` response,
your `POST` has been accepted. You also get a message body that is associated
with the 200 response, so you know it has been accepted and you have a response
in regards to your message. We can be certain of success and we can be certain
of the response to our request.

You'll notice, however, that this module has no HTTP in it. That's because the
networking is down stream. Paxos is built to be deterministic and...

*Ed: Picking at this bit here. Want to talk in terms of HTTP, without making
people think that we're going to be RESTful and use HTTP error codes.*

We are not so certain of failure, but we do know one thing...

Because we're using HTTP/S we can expose ourselves to the world through HTTP/S
clients, we'll know success for certain, but not failure, so we'll build our
system around retries, and we can host ourselves where ever fine HTTP/S is
served.

For the purpose of our algorithm, a transcript is either entirely received or
entirely lost. We know that if we send a collection of messages the recipient
will either receive and play all messages or receive no messages.

Determinism is the name of the game.

The transcript is checksummed. We don't play a transcript unless we get the full
transcript and it passes its checksum.

Many messages are forwarded between **citizens**. They do not always have to
come from the originating **citizen**. Another **citizen** can relay what
another **citizen** has told it. (Once a **decision** has become actionable.)

We bundle all of the Paxos messages that are due to be sent to another
**citizen** in a single transcript.

*Ed: Getting repetitive here. Start reading three paragraphs up when you're
clear headed, see if you can tidy this.*

When our **leader** sends an **accept** message on behalf of the **client**, it
`POST`s it first to one **legislator** in the **majority** then who `POST`s it
to the other **legislator** in the **majority** in what we call a **pulse**. The
participants in a **pulse** are the members of the **majority**. *Ed: describe
using a **five** member parliament.* The **leader** `POST`s to one
**legislator** in the **majority**, that member `POST`s to the next before
returning, and so on until all the members of the majority are reached. When the
`POST` returns for the **leader** returns 200 it will have sent a message to all
the members of the **majority**.

We first have an **accept** **pulse**. With a **parliament** of five
**legislators**, the leader first **accepts** the proposal instance itself and
responds to it's own **accept** message. Then it `POST`s the **accept** message
along with its **accepted** method to the first **legislator** in the **accept**
**pulse**. The first **legislator** **accepts** the proposal instance and then
sends the **accept** message along with both **accepted** messages to the second
and last **legislator** in the **accept pulse**. The last **legislator**
responds to the **accept** message.

We have an **accept** **pulse**. The **leader** starts an instance of Paxos with
an **accept** message to itself. It then sends the **accept** message along with
its **accepted** message to the **proxy**. The **proxy** accepts the **accept**
message and sends it along with **accepted** message of both the leader and the
proxy to the terminal legislator. The terminal legislator accepts the **accept**
message.

*Ed: Totally repeating myself here. Must have been trying to chose
nomenclature.*

At this point the terminal legislator has learned the instance of Paxos, or in
our wider analogy, it has learned the decision. It knows that two other
legislators know of the decision, but this is the first legislator to know that
it has been decided.

*Ed: Okay, let's do this instead. We have to pulses, the first one the
legislators agree, the second they decide. Or it could be be accepted and
decided.*

At this point the terminal legislator has an **accept** message from all three
members of the **majority**, so it knows that the all three members of the
**majority** now **agree** to the message.

Although a **majority** of **legislators** **agree** on the message, the message
is not actionable until the majority of **legislators** know that they are in
**agreement**.

To inform the majority of the **agreement**, the terminal **legislator** returns
an **agreed** message to it's caller along with an **accept** message, the
**second legislator**. The **second legislator** gets the **accept** message
from the return from the **terminal legislator** and now has an **accept**
message from all three members of the **majority**, therefore it too can see
that the **majority** is in **agreement** on the message.

The **second legislator** now returns the `POST` from the **leader legislator**
sending in the `POST` body the **accepted** and **agreed** tokens from the
**terminal legislator** and the **accepted** and **agreed** tokens from itself.

Now the **leader legislator** has an **accepted** token from all three members
of the **majority** so it generates an **agreed** token. With that freshly
generated **agreed** token, it now an **agreed** token from all three members of
the **majority**. When a legislator receives a majority of **agreed** tokens, it
can then mark the message (proposal?) as **decided**.

The moment a message has been **decided** it can then be broadcast to all the
**citizens** of the **island**. The decision has been ...

*Ed: Ah, yes, I like leader, proxy and terminal.*

*Ed: Was that better?*

*Ed: Nope, it is really this...*

It has been decided, but it has not been recorded. We may forget that we made
his decision unless we can record that decision in such a way that it can be
recovered in the event of a failure.

*Ed: And so, recorded is like learned, but learned is so, well, I believe it
gets the reader thinking in too clever terms. Why not say recorded, if that is
what it is meant to be? Why say learned and deal with the overloading of
learning as it pertains to computer science? My heuristic is to only use
analogies if they are odd ball analogies that have not already been employed in
the history of computing. I wouldn't use the work "panic," for example, to
describe anything other than an immediate shutdown in response to an
unrecoverable error, not to describe, say, the reelection in the Paxos algorithm
in this way; the legislators are now in a tizzy to they panic and try each tried
to elect itself leader, we call this a panic. Horrible, yes, and also a horrible
example, but the point is that although learn comes from the existing literature
it is a bad choice for my revised Alan's Paxos, given the intensity of the
existing literature, learning, well, some knucklehead post-modernist could go on
about words and what they mean. I suppose I'm saying, speak plainly or speak
goofy.*

*Ed: On it's way.*

However, the decision will not be actionable until a majority of the parliament
also knows that the decision has been made.

The terminal legislator returns a **learned** message addressed to the
**leader** along with its **accept** message. The proxy legislator accepts  the
**accept** message and now it has a majority of accept messages. The proxy
legislator has now also learned of the decision.

So long as a majority of the legislators do not stop-crash, we will be able to
eventually resume after a network failure. If a majority of the legislators
stop-crash we will know definitively that our community has failed.

***Note***: We only ever use the proposal resolution of Paxos to form a new
government. We are not going to proceed until we resolve the business of the
last government. We have an interim government who's business is to resolve the
business of the last continual government. When a government resolves the
business of the last continual government,  it becomes a continual government.
If the government is unable to resolve the business of the previous continual
government, it becomes a failed government. There is no need to resolve the
business of a failed government.

A failed legislator can only form a government with a majority of failed
legislators. Wait, how does a legislator know that was a legislator? The id is
persistent. *Ed: Old note. What follows is an admonishment.* No, no, no. No. If
you crash-stop you're dead. There has to be a point where things recover. At
this stage in adoption, it would be enough to raise an alarm and have an
administrator crash-stop and recover. Let's gear Alan's Paxos for operation in a
hosted environment where we want crash-stop.

***Note***: Attempting to write in a lazy fashion so that you can recover from
crash-stop is a race condition. If you're okay with that race condition, then
you can get ROFLscale. *Ed: Another old note. We can recover from memory, not
from write, but there are still reasons to write.*

When we lose confidence in our **government**, any of the **legislators** will
call for a **vote of confidence**.

*Ed: Getting really crufty, older revisions.*

Rougher notes:

Okay, here it is. The strong leader, if at any point the strong leader detects a
failure, the strong leader fails the round by starting a new round. That will
mean that the proposal will never reach a quorum that will allow it to be
actionable. The strong leader can veto the round.

The shape is a strong leader and two acceptors. There is proxy acceptor and
final acceptor. It takes two pulses of the proxy to get a round actionable. At
any point, these can talk to the other two legislators, they are delegates, they
learn before the constituents learn. We do not send messages to the
constituents, we have the delegates relay the messages for us.

In normal operation, the strong leader will know after the second pulse that the
round is actionable can can tell whatever client. The acceptors can only teach
the delegates and the strong leader.

This is the shape of government. A government has an id. We know for a certain
government that we are producing a chain of entries and that they will all have
the same three acceptors accepting them. And accepted message includes the id of
the previously accepted round. We can always walk back through this chain to see
the integrity of the chain. Thus, a log entry is only actionable when you have
received a majority of learned messages and when the preceding log entry is
actionable.

After the first pulse, the strong leader has an actionable entry. After the
second pulse the acceptors have an actionable entry. The first is the learn
pulse and the second is the action pulse. A pulse can be both an action pulse
for the current instance and a learn pulse for the prior instance.

If a learn pulse fails, the strong leader starts a new proposal number,
invalidating item being learned. The strong leader then takes the actionable
data and broadcasts it to all legislators.

Once the strong leader has an actionable entry, the strong leaders next action
is to make the entry actionable for a majority of the parliament. Once it is
actionable by a majority of the parliament it can be enforced.

SOMEWHERE NOTE: Actionable means that previous messages can be replayed for a
certain audience. The acceptors can replay accepted and learners for the
delegates, the delegates can replay them for the constituents, the strong leader
can play them for any other legislator.

If the pulse fails because one or both of the acceptors have gone, the strong
leader invalids the learn pulse by starting a new round and accepting it. It
takes its actionable entry and broadcasts it, so that it arrives at the
delegates so that there are at least three copies still.

It then forms a new government.

If the pulse fails because one acceptor and one delegate is gone, the strong
leader invalids the learn pulse by starting a new round and accepting it. It
takes its actionable entry and broadcasts it, so that it arrives at the
delegates so that there are at least three copies still.

It then forms a new government.

The strong leader choses two new acceptors and one delegate. It forms a new
government in a government round. It then chooses a constituent, if available,
to become a legislator, or else it reduces the size of the parliament by one and
adjusts the quorum. It then arbitrarily chooses acceptors to form a majority.
The minority become disseminates.

If the strong leader fails then we have a leadership election. The round is
flagged for leadership. We are using Paxos here, but it is not important that
the log be up to date before we act. If we detect that a leader has failed, then
any one of the legislators will attempt to seize control of parliament by
nominating itself as the strong leader and calling a round of Paxos.


### Diary

This can go in the release notes:

Removing the notion of `prefer` which adds state when this can be done just as
easily externally by calling `newGovernment` with a light adjustment. Indeed,
how do you suggest a new government for the sake of creating a break to flush
the logs? The user needs the ability to call elections. I'm sure it is already
there, I just can't see it. We can add to that ability the ability to appoint
a constituent to the minority, move a minority member to the majority, and make
a member of the majority the leader.
