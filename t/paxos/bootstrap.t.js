require('proof')(1, function (assert) {
    var Legislator = require('../../legislator')

    function run (messages, leaders, stop, count) {
        stop = stop == null ? Infinity : stop, count = count || 0
        messages.forEach(function (message) {
            console.log(0, message)
        })
        for (var i = 0; messages.length && i < stop; i++ ) {
            messages = Legislator.dispatch(messages, legislators)
            messages.forEach(function (message) {
                console.log(count + i + 1, message)
            })
        }
        return messages
    }

    var legislators = [ new Legislator(0) ]
    var messages = legislators[0].bootstrap()

    Legislator.dispatch2(legislators, [ 0 ], messages, function (id, message) {
        console.log(0, id, message)
    })

    assert(legislators[0].government, {
        leader: 0, majority: [ 0 ], members: [ 0 ], interim: false
    }, 'bootstrap')

    legislators.push(new Legislator(1))

    var messages = legislators[1].sync([ 0 ], 20)

    Legislator.dispatch2(legislators, [ 1 ], messages, function (id, message) {
        console.log(1, id, message)
    })

    legislators[1].log.each(function (entry) {
        console.log('entry', entry)
    })
})

/*
Legislator.prototype.markLastest = function (entry, type) {
    if (Id.compare(this.last[this.id][type], entry.id) < 0) {
        this.last[this.id][type] = entry.id
    }
    entry[type] = true
}
*/
