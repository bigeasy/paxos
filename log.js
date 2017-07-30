function Log (enactor) {
    this.enactor = enactor
}

Log.prototype.write = function (value) {
    this.written = value
}

Log.prototype.commit = function () {
    var entry = this.written
    this.written = null

    var entries = []
    while (entry) {
        entries.push({
            body: entry.body
        })
        entry = entry.previous
    }

    entries.forEach(function (entry) { this.enactor.enact(entry) }, this)
}

module.exports = Log
