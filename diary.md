http://research.microsoft.com/pubs/64634/web-dsn-submission.pdf

http://stackoverflow.com/questions/5850487/questions-about-paxos-implementation/10151660#10151660

- figure out best way to notify all nodes designated as learner/acceptor; separate from node#sendToAcceptors?

- stateLog format: round number as key, returns object with time, value, current leader

- write tests to ensure algorithm is sound.

- figure out what to do after a round ends.
