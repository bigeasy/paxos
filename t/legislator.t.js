require('proof')(10, prove)

function prove (assert) {
    var Legislator = require('../legislator')

    ! function () {
        var legislator = new Legislator(1, '1', 0)

        assert(legislator._expand.call({
            _trace: function () {},
            parliamentSize: 3,
            government: {
                majority: [ 0, 1 ],
                minority: [ 2 ]
            }
        }), null, 'expand already right size')
        assert(legislator._expand.call({
            _trace: function () {},
            parliamentSize: 5,
            id: 0,
            government: {
                majority: [ 0, 1 ],
                minority: [ 2 ]
            },
            peers: {
                0: { naturalized: true, timeout: 0 },
                1: { naturalized: true, timeout: 0 },
                2: { naturalized: true, timeout: 0 },
                3: { naturalized: true, timeout: 0 }
            }
        }), null, 'expand not enough present')
        assert(legislator._expand.call({
            _trace: function () {},
            parliamentSize: 5,
            id: '0',
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ],
                constituents: [ '3', '4' ]
            },
            peers: {
                0: { naturalized: true, timeout: 0 },
                1: { naturalized: true, timeout: 0 },
                2: { naturalized: true, timeout: 0 },
                3: { naturalized: true, timeout: 0 },
                4: { naturalized: true, timeout: 0 }
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
        var legislator = new Legislator(1, '1', 0)

        assert(legislator._impeach.call({
            _trace: function () {},
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3', '4' ]
            },
            peers: {
                3: { timeout: 0 },
                4: { timeout: 1 }
            }
        }), null, 'impeach all good')
        assert(legislator._impeach.call({
            _trace: function () {},
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3', '4' ]
            },
            peers: {
                4: { timeout: 0 }
            }
        }), null, 'impeach missing')
        assert(legislator._impeach.call({
            _trace: function () {},
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3', '4' ],
                constituents: [ '5' ]
            },
            peers: {
                3: { timeout: 2 },
                4: { timeout: 0 },
                5: { timeout: 0 }
            }
        }), {
            quorum: [ '0', '1', '2' ],
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '4' ]
            }
        }, 'impeach')
    } ()

    ! function () {
        var legislator = new Legislator(1, '1', 0)

        assert(legislator._shrink.call({
            _trace: function () {},
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3' ]
            },
            peers: {
                0: { timeout: 0 },
                1: { timeout: 0 },
                2: { timeout: 0 },
                3: { timeout: 0 }
            }
        }), {
            quorum: [ '0', '1', '2' ],
            government: {
                majority: [ '0', '1', '2' ],
                minority: []
            }
        }, 'shrink minority to three member parliament')
        assert(legislator._shrink.call({
            _trace: function () {},
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2' ],
                minority: []
            },
            peers: {
                0: { timeout: 0 },
                1: { timeout: 0 },
                2: { timeout: 0 }
            }
        }), {
            quorum: [ '0', '1', '2' ],
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ]
            }
        }, 'shrink majority')
    } ()

    ! function () {
        var legislator = new Legislator(1, '1', 0)

        assert(legislator._exile.call({
            _trace: function () {},
            timeout: 2,
            government: {
                constituents: [ '3', '4' ]
            },
            peers: {
                3: { timeout: 0 },
                4: { timeout: 1 }
            }
        }), null, 'exile all good')
        assert(legislator._exile.call({
            _trace: function () {},
            timeout: 2,
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ],
                constituents: [ '3', '4' ]
            },
            peers: {
                3: { timeout: 0 },
                4: { timeout: 2 }
            }
        }), {
            quorum: [ '0', '1' ],
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ],
                exile: '4'
            }
        }, 'exile')
    } ()
}
