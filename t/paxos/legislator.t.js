require('proof')(1, function (assert) {
    var Legislator = require('../../legislator')

    var parliment = []
    for (var i = 0; i < 5; i++) {
        parliment.push(new Legislator(i))
    }

    var leader = parliment[0]

    leader.quorum = parliment.slice(0, 3).map(function (legislator) {
        return legislator.id
    })

    var messages = leader.propose('able')

    console.log(messages)
    messages = Legislator.dispatch(messages, parliment)
    console.log(messages)
    messages = Legislator.dispatch(messages, parliment)
    console.log(messages)
    messages = Legislator.dispatch(messages, parliment)
    console.log(messages)
    messages = Legislator.dispatch(messages, parliment)
    console.log(messages)
    messages = Legislator.dispatch(messages, parliment)
    console.log(messages)
    messages = Legislator.dispatch(messages, parliment)
    console.log('x', messages)

    console.log(parliment[0].log.find({ id: [ 1 ]}))
    console.log(parliment[1].log.find({ id: [ 1 ]}))
    console.log(parliment[2].log.find({ id: [ 1 ]}))

    assert(parliment[0].log.find({ id: [ 1 ]}).value, 'able', 'successful round')

            // ^^^ Legislature?
    return

    function post (legislator, path) {
        legislator.consume
    }

    function broadcast (messages, legislator) {
        messages.forEach(function (message) {
            message.to.forEach(function (id) {
                post(parliment[id], [ legislator.id ])
            })
        })
    }

    broadcast()
})
