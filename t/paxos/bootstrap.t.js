require('proof')(4, function (assert) {
    var Legislator = require('../../legislator')

    var legislators = [ new Legislator(0) ], messages
    messages = legislators[0].bootstrap()

    function logger (count, id, message) {
        console.log(count, id, message)
    }

    messages = Legislator.synchronous(legislators, 0, messages, logger)

    assert(legislators[0].government, {
        id: '1/1', leader: 0, majority: [ 0 ], members: [ 0 ], interim: false
    }, 'bootstrap')

    legislators.push(new Legislator(1))

    messages = legislators[1].sync([ 0 ], 20)

    messages = Legislator.synchronous(legislators, 1, messages, logger)

    legislators[1].log.each(function (entry) {
        // console.log('entry', entry)
    })

    assert(legislators[1].government, {
        id: '1/1', leader: 0, majority: [ 0 ], members: [ 0 ], interim: false
    }, 'synchronize join')

    // todo: yes, you look inside the response. it is not opaque. you are at
    // this low level when you are trying to create an interface to an algorithm
    // that is uncommon and subtle.
    messages = legislators[1].naturalize()
    var cookie = messages[0].cookie
    assert(cookie, 1, 'cookie')
    Legislator.synchronous(legislators, 1, messages, logger)

    assert(legislators[0].government, {
        id: '2/1', leader: 0, majority: [ 0, 1 ], members: [ 0, 1 ], interim: false
    }, 'grow')

    return

    assert(legislators[1].government, {
        id: '2/1', leader: 0, majority: [ 0, 1 ], members: [ 0, 1 ], interim: false
    }, 'cleanup pulse')

//    messages = legislators[1].sync([ 0 ], 20)
//    Legislator.synchronous(legislators, 1, messages, logger)
})
