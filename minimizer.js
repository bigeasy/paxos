Monotonic = require('monotonic').asString

function Minimizer () {
    this._minimums = {}
}

Minimizer.prototype.update = function (paxos, id, minimum) {
}

module.exports = Minimizer
