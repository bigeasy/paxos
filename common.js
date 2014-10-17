var Skiplist = require('skiplist')

function Common (id) {
    this.id = id
    this.round = 1
    this.promisedId = 0
    this.promisedId = 0
    this.acceptedId = 0
    this.lastAcceptedId = 0
    this.lastAccepted = null
    this.promises = []
    this.stateLog = {}
    this.skiplist = new Skiplist()
}

Common.prototype.log = function () {
}

module.exports = Common
