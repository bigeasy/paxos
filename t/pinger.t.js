require('proof')(6, prove)

function prove (okay) {
    var Pinger = require('../pinger')
    var expect = [{
        id: '1', reachable: true, label: 'reachable', naturalized: false, committed: '1/0'
    }, {
        id: '1', reachable: true, label: 'naturalized reachable', naturalized: true, committed: '1/0'
    }, {
        id: '1',
        reachable: false,
        label: 'unreachable',
        naturalized: true,
        committed: '1/0',
        response: {
            quorum: [ '0', '1' ],
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ]
            }
        }
    }, {
        id: '0', reachable: true, label: 'copy self', naturalized: true, committed: '2/0'
    }, {
        // TODO This is the one test that you can look at to remind yourself
        // that the unit tests are meaningful. Try to imagine how you would test
        // this behavior in an integration test and preserve that test as you
        // change the whole. You would see the branch coverage, but how would
        // you know that it does preserve a timeout from one copy to the next?
        id: '1', reachable: false, label: 'still expired', naturalized: true, committed: '1/0'
    }]
    function update (id, reachable, committed, naturalized) {
        var expectation = expect.shift()
        okay({
            id: id,
            reachable: reachable,
            naturalized: naturalized,
            committed: committed
        }, {
            id: expectation.id,
            reachable: expectation.reachable,
            naturalized: expectation.naturalized,
            committed: expectation.committed
        }, expectation.label)
        return expectation.response || null
    }
    var pinger = new Pinger({
        timeout: 1000,
        government: { majority: [] },
        newGovernment: function (now, quorum, government) {
            okay({
                quorum: quorum,
                government: government
            }, {
                quorum: [ '0', '1' ],
                government: {
                    majority: [ '0', '1' ],
                    minority: [ '2' ]
                }
            }, 'reshaped')
        }
    }, {
        update: update
    })

    pinger.update(0, '1', { naturalized: false, committed: '1/0' })
    pinger.update(0, '1', { naturalized: true, committed: '1/0' })
    pinger.update(0, '1', null)
    pinger.update(999, '1', null)
    pinger.update(1000, '1', null)
    pinger.update(1001, '1', null)
    pinger = pinger.createPinger(1001, {
        id: '0',
        timeout: 1000,
        naturalized: true,
        government: {
            promise: '2/0',
            majority: [ '2', '0' ],
            minority: [ '1' ],
            constituentcy: []
        },
        constituency: [ '1' ]
    }, {
        update: update
    })
    pinger.update(1001, '1', null)
}
