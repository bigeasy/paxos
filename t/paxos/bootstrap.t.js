require('proof')(2, function (assert) {
    var Legislator = require('../../legislator')

    function run (messages, leaders, stop, count) {
        stop = stop == null ? Infinity : stop, count = count || 0
        messages.forEach(function (message) {
            console.log(0, message)
        })
        for (var i = 0; messages.length && i < stop; i++ ) {
            messages = Legislator.synchronous(messages, legislators)
            messages.forEach(function (message) {
                console.log(count + i + 1, message)
            })
        }
        return messages
    }

    var legislators = [ new Legislator(0) ]
    var messages = legislators[0].bootstrap()

    var messages = Legislator.synchronous(legislators, 0, messages, function (count, id, message) {
        console.log(count, id, message)
    })

    assert(legislators[0].government, {
        id: '1/1', leader: 0, majority: [ 0 ], members: [ 0 ], interim: false
    }, 'bootstrap')

    legislators.push(new Legislator(1))

    var messages = legislators[1].sync([ 0 ], 20)

    var messages = Legislator.synchronous(legislators, 1, messages, function (count, id, message) {
        console.log(count, id, message)
    })
    console.log(messages)

    legislators[1].log.each(function (entry) {
        console.log('entry', entry)
    })

    assert(legislators[1].government, {
        id: '1/1', leader: 0, majority: [ 0 ], members: [ 0 ], interim: false
    }, 'synchronize join')

    // todo: yes, you look inside the response. it is not opaque. you are at
    // this low level when you are trying to create an interface to an algorithm
    // that is uncommon and subtle.
    var messages = legislators[1].naturalize()
    var cookie = messages[0].cookie
    assert(cookie, 1, 'cookie')
})
