require('proof')(3, prove)

function prove (okay) {
    var Pinger = require('../pinger')
    var expect = [{
        id: '1', reachable: true, label: 'reachable'
    }, {
        id: '1', reachable: false, label: 'unreachable'
    }]
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
        update: function (id, reachable) {
            var expectation = expect.shift()
            okay({
                id: id,
                reachable: reachable
            }, {
                id: expectation.id,
                reachable: expectation.reachable
            }, expectation.label)
            if (!reachable) {
                return {
                    quorum: [ '0', '1' ],
                    government: {
                        majority: [ '0', '1' ],
                        minority: [ '2' ]
                    }
                }
            }
        }
    })

    pinger.update(0, '1', { naturalized: false })
    pinger.update(0, '1', { naturalized: true })
    pinger.update(0, '1', null)
    pinger.update(1000, '1', null)
    pinger.update(1001, '1', null)
}
