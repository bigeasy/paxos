var Procession = require('procession')

function Redux () {
    this.outbox = new Procession
}

Redux.prototype.bootstrap = function (now, republic, properties) {
    this.now = now
    this.republic = republic
}

module.exports = Redux
