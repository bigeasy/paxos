require('proof')(1, function (assert) {
    var slice = [].slice, push = [].push, transcript = []

    var util = require('../../utility')

    var Common = require('../../common')
    var Queue = require('../../queue')

    var Learner = require('../../learner')
    var Acceptor = require('../../acceptor')
    var Proposer = require('../../proposer')

    var queue = new Queue
    var proposers = [], acceptors = [], learners = [], nodes = [], participants = []
    for (var i = 0; i < 3; i++) {
        var node = {}
        var proposer = new Proposer('p' + i)
        var acceptor = new Acceptor('a' + i)
        var learner = new Learner('l' + i)
        proposers.push(proposer)
        acceptors.push(acceptor)
        learners.push(learner)
        nodes.push({
            proposer: proposer,
            acceptor: acceptor,
            learner: learner
        })
        participants.push(proposer, acceptor, learner)
    }

    nodes.forEach(function (node, index) {
        var common = new Common(index)
        common.quorum = 2
        for (var key in node) {
            node[key].reset(queue, common)
        }
    })

    function befuddle (messages) {
        var befuddled = { included: [], excluded: [] }
        var vargs = slice.call(arguments)
        var messages = vargs.shift()
        var test = vargs.length == 1 ? vargs.shift() : function (message) {
            return message[vargs[0]] == vargs[1]
        }
        messages.forEach(function (message) {
            if (test(message)) befuddled.included.push(message)
            else befuddled.excluded.push(message)
        })
        return befuddled
    }

    var split = befuddle([], 'particpantId', 'p1')

    // Best case round.

    var messages = proposers[0].startProposal('able')

    push.apply(transcript, messages)

    messages = util.dispatch(messages, participants)
    console.log(messages)
    messages = util.dispatch(messages, participants)
    console.log(messages)
    messages = util.dispatch(messages, participants)
    console.log(messages)
    messages = util.dispatch(messages, participants)
    console.log(messages)

    assert(true)
})
