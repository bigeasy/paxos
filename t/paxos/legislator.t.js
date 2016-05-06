require('proof')(15, prove)

function prove (assert) {
    var Legislator = require('../../legislator')
    var signal = require('signal')
    var Legislator = require('../../legislator'),
        signal = require('signal')

    signal.subscribe('.bigeasy.paxos.invoke'.split('.'), function (id, method, vargs) {
         if (id == '0') {
            // console.log(JSON.stringify({ method: method, vargs: vargs }))
        }
    })

    var time = 0, gremlin

    var options = {
        Date: { now: function () { return time } },
        parliamentSize: 5,
        ping: 1,
        timeout: 2,
        retry: 5
    }

    signal.subscribe('.bigeasy.paxos.invoke'.split('.'), function (id, method, vargs) {
         if (id == '0') {
            // console.log(JSON.stringify({ method: method, vargs: vargs }))
        }
    })

    ! function () {
        var legislator = new Legislator(0, '1')

        legislator._schedule(0, { id: 'scheduled', type: 'scheduled', delay: 0 })
        legislator._schedule(0, { id: 'removed', delay: 0 })
        legislator._unschedule('removed')

        var wasScheduled = false
        legislator._whenScheduled = function () {
            wasScheduled = true
        }

        legislator._whenRemoved = function () {
            throw new Error
        }

        assert(legislator.checkSchedule(0), 'check schedule')
        assert(wasScheduled, 'scheduled')
    } ()

    ! function () {
        var legislator = new Legislator(0, '1')

        assert(legislator._expand.call({
            collapsed: true
        }), null, 'expand already electing')
        assert(legislator._expand.call({
            parliamentSize: 3,
            government: {
                majority: [ 0, 1 ],
                minority: [ 2 ]
            }
        }), null, 'expand already right size')
        assert(legislator._expand.call({
            parliamentSize: 5,
            id: 0,
            government: {
                majority: [ 0, 1 ],
                minority: [ 2 ]
            },
            _peers: {
                0: { timeout: 0 },
                1: { timeout: 0 },
                2: { timeout: 0 },
                3: { timeout: 0 }
            }
        }), null, 'expand not enough present')
        assert(legislator._expand.call({
            parliamentSize: 5,
            id: '0',
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ],
                constituents: [ '3', '4' ]
            },
            _peers: {
                0: { timeout: 0 },
                1: { timeout: 0 },
                2: { timeout: 0 },
                3: { timeout: 0 },
                4: { timeout: 0 }
            }
        }), {
            quorum: [ '0', '1', '2' ],
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3', '4' ]
            }
        }, 'expand')
    } ()

    ! function () {
        var legislator = new Legislator(0, '1')

        assert(legislator._impeach.call({
            collapsed: true
        }), null, 'impeach already electing')
        assert(legislator._impeach.call({
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3', '4' ]
            },
            _peers: {
                3: { timeout: 0 },
                4: { timeout: 1 }
            }
        }), null, 'impeach all good')
        assert(legislator._impeach.call({
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3', '4' ]
            },
            _peers: {
                4: { timeout: 0 }
            }
        }), null, 'impeach missing')
        assert(legislator._impeach.call({
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3', '4' ],
                constituents: [ '5' ]
            },
            _peers: {
                3: { timeout: 2 },
                4: { timeout: 0 },
                5: { timeout: 0 }
            }
        }), {
            majority: [ '0', '1', '2' ],
            minority: [ '4', '5' ]
        }, 'impeach replace')
        assert(legislator._impeach.call({
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3', '4' ]
            },
            _peers: {
                0: { timeout: 0 },
                1: { timeout: 0 },
                2: { timeout: 0 },
                3: { timeout: 2 },
                4: { timeout: 0 }
            }
        }), {
            quorum: [ '0', '1', '2' ],
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ]
            }
        }, 'impeach shrink to three member parliament')
        assert(legislator._impeach.call({
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ]
            },
            _peers: {
                0: { timeout: 0 },
                1: { timeout: 0 },
                2: { timeout: 2 }
            }
        }), {
            quorum: [ '0', '1' ],
            government: {
                majority: [ '0' ],
                minority: []
            }
        }, 'impeach shrink to dictator')
    } ()

    ! function () {
        var legislator = new Legislator(0, '1')

        assert(legislator._exile.call({
            collapsed: true
        }), null, 'exile collapsed')
        assert(legislator._exile.call({
            timeout: 2,
            government: {
                constituents: [ '3', '4' ]
            },
            _peers: {
                3: { timeout: 0 },
                4: { timeout: 1 }
            }
        }), null, 'exile all good')
        assert(legislator._exile.call({
            timeout: 2,
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ],
                constituents: [ '3', '4' ]
            },
            _peers: {
                3: { timeout: 0 },
                4: { timeout: 2 }
            }
        }), {
            quorum: [ '0', '1' ],
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ],
                exiles: [ '4' ]
            }
        }, 'exile')
    } ()
}
