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

    run(messages, legislators)

    assert(legislators[0].government, {
        leader: 0, majority: [ 0 ], members: [ 0 ], interim: true
    }, 'bootstrap')

    legislators.push(new Legislator(1))
})
