require('proof')(2, function (assert) {
    var Learner = require('../../learner')

    var learner = new Learner

    learner.reset(null, {})
    learner.acceptors[1] = []

    assert(learner.receiveAccepted({
        from: 1,
        proposalId: 1,
        acceptedValue: 'foo'
    }), [], 'accept')

    assert(learner.receiveAccepted({
        from: 1,
        proposalId: 1,
        acceptedValue: 'foo'
    }), [], 'accept again')
})
