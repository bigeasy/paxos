http://research.microsoft.com/pubs/64634/web-dsn-submission.pdf

http://stackoverflow.com/questions/5850487/questions-about-paxos-implementation/10151660#10151660

- stateLog format: round number as key, returns object with time, value, current leader
    - switched to using Date object as key and including round number in the object

- don't forget. Node processes not root - port 1024 & up

- TODO:
    load from config file
    possibly give each node a cluster object to store instance info

- talk to Alan about Proof so that tests will pass.
