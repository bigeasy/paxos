require('proof')(1, function (assert) {
    var Legislator = require('../../legislator')

    var parliment = []
    for (var i = 0; i < 5; i++) {
        parliment.push(new Legislator(i))
    }

    var leader = parliment[0]

    var majority = parliment.filter(function (legislator) {
        return ~leader.government.majority.indexOf(legislator.id)
    })

    var messages = leader.propose('able')

    console.log('proposed', messages)
    messages = Legislator.dispatch(messages, majority)
    console.log('promise', messages)
    messages = Legislator.dispatch(messages, majority)
    console.log('leader accepted', messages)
    messages = Legislator.dispatch(messages, majority)
    console.log('proxy accepted', messages)
    messages = Legislator.dispatch(messages, majority)
    console.log('terminus accepted', messages)
    messages = Legislator.dispatch(messages, majority)
    console.log('proxy returned', messages)
    messages = Legislator.dispatch(messages, majority)
    console.log(majority[0].log.find({ id: [ 1 ]}))
    console.log('leader actionable', messages)

    console.log(majority[0].log.find({ id: [ 1 ]}))
    console.log(majority[1].log.find({ id: [ 1 ]}))
    console.log(majority[2].log.find({ id: [ 1 ]}))

    assert(majority[0].log.find({ id: [ 1 ]}).value, 'able', 'successful round')

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
