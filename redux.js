var Procession = require('procession')

function Redux () {
    this.outbox = new Procession
}

Redux.prototype.bootstrap = function (now, republic, properties) {
    this.now = now
    this.republic = republic
}

Redux.prototype.newGovernment = function (now, quorum, government, promise) {
    var constituents = Object.keys(this.government.properties).filter(function () {
        return !~government.majority.indexOf(citizen)
            && !~government.minority.indexOf(citizen)
    }).sort()
    var remapped = government.promise = promise, map = {}
    var proposals = this.proposals.splice(0, this.proposals.length).map(function (proposal) {
        proposal.was = proposal.promise
        proposal.route = government.majority
        proposal.promise = remapped = Monotonic.increment(remapped, 1)
        map[proposal.was] = proposal.promise
        return proposal
    })
    this.lastIssues = remapped
    var properties = JSON.parse(JSON.stringify(this.government.properties))
    var immigrated = JSON.parse(JSON.stringify(this.government.immigrated))
    if (government.immigrate) {
    }
}

module.exports = Redux
