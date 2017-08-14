// Prior to an election we run the sync algorithm against all the other
// legistators and the first to come back with with complete syncs are then
// candidates for a new government.

// This will be some sort of ping event handler.

// ---

// Node.js API.
var assert = require('assert')

// Create an assembly with the given government.

//
function Assembly (government) {
    this._government = government
    this._reachable = []
    this.collapsed = true
}

// We assume that update will be called first with the id of this citzen and
// that the citizen will be reachable because citizens will always be able to
// reach themselves.

//
Assembly.prototype.update = function (id, reachable) {
    if (reachable) {
        // If we are reachable add the id if it hasn't already been added.
        if (!~this._reachable.indexOf(id)) {
            this._reachable.push(id)
        }
    } else {
        // If we are not reachable remove the id if it has already been added.
        var index = this._reachable.indexOf(id)
        if (~index) {
            this._reachable.splice(index, 1)
        }
    }

    if (this._reachable.length == this._government.majority.length) {
        // Get all of the legislators.
        var legislators = this._government.majority.concat(this._government.minority)

        // The reacahble legislators will make up our new majority.
        var majority = this._reachable.filter(function (id) {
            return ~legislators.indexOf(id)
        })

        // Assert that all of the reachable ids are indeed members of the
        // government.
        assert(majority.length == this._reachable.length)

        // The remainder of the legislators make up the minority.
        var minority = legislators.filter(function (id) {
            return !~majority.indexOf(id)
        })

        // Our attempt at a new government.
        return {
            quorum: this._reachable,
            government: {
                majority: majority,
                minority: minority
            }
        }
    }

    return null
}

module.exports = Assembly
