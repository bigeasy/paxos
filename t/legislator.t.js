require('proof/redux')(21, prove)

function prove (assert) {
    var Paxos = require('..')

    function stuff (denizen, options) {
        denizen.id = options.id
        denizen.pings = {}
        for (var name in options) {
            switch (name) {
            case 'naturalized':
                options[name].forEach(function (id) {
                    denizen.pings[id] = { naturalized: true, timeout: 0 }
                })
                break
            case 'ponged':
                options[name].forEach(function (id) {
                    denizen.pings[id] = { timeout: 0 }
                })
                break
            case 'timedout':
                options[name].forEach(function (id) {
                    denizen.pings[id] = { naturalized: true, timeout: denizen.timeout }
                })
                break
            default:
                denizen[name] = options[name]
                break
            }
        }
        return denizen
    }

    ! function () {
        var denizen = new Paxos('1', {})

        assert(stuff(denizen, {
            parliamentSize: 3,
            id: '0',
            government: {
                majority: [ '0' ],
                minority: [],
                constituents: [ '1', '2' ]
            },
            naturalized: [ '0', '1', '2' ]
        })._expand(), {
            quorum: [ '0', '1' ],
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ]
            }
        }, 'expand from dictatorship')
        assert(stuff(denizen, {
            parliamentSize: 5,
            id: '0',
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ],
                constituents: [ '3', '4' ]
            },
            naturalized: [ '0', '1', '2', '3' ]
        })._expand(), null, 'expand not enough present')
        assert(stuff(denizen, {
            parliamentSize: 5,
            id: '0',
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ],
                constituents: [ '3', '4' ]
            },
            naturalized: [ '0', '1', '2', '3', '4' ]
        })._expand(), {
            quorum: [ '0', '1', '2' ],
            government: {
                majority: [ '0', '1', '2' ],
                minority: []
            }
        }, 'expand majority')
        assert(stuff(denizen, {
            parliamentSize: 5,
            id: '0',
            government: {
                majority: [ '0', '1', '2' ],
                minority: [],
                constituents: [ '3', '4' ]
            },
            naturalized: [ '0', '1', '2', '3', '4' ]
        })._expand(), {
            quorum: [ '0', '1', '2' ],
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3' ]
            }
        }, 'add first member of minority')
        assert(stuff(denizen, {
            parliamentSize: 5,
            id: '0',
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3' ],
                constituents: [ '4' ]
            },
            naturalized: [ '0', '1', '2', '3', '4' ]
        })._expand(), {
            quorum: [ '0', '1', '2' ],
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3', '4' ]
            }
        }, 'add second member of minority')
    } ()

    ! function () {
        var denizen = new Paxos('1', {})

        assert(stuff(denizen, {
            id: '0',
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3', '4' ]
            },
            ponged: [ '3', '4' ]
        })._impeach(), null, 'impeach all good')
        assert(stuff(denizen, {
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3', '4' ]
            },
            ponged: [ '4' ]
        })._impeach(), null, 'impeach missing')
        assert(stuff(denizen, {
            id: '0',
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3', '4' ],
                constituents: [ '5' ]
            },
            timedout: [ '3', '4' ]
        })._impeach(), {
            quorum: [ '0', '1', '2' ],
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '4' ]
            }
        }, 'impeach only one at a time')
    } ()

    ! function () {
        var denizen = new Paxos('1', {})

        assert(stuff(denizen, {
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2', '3' ],
                minority: [ '4', '5' ]
            },
            ponged: [ '0', '1', '2', '3', '4', '5' ]
        })._shrink(), {
            quorum: [ '0', '1', '2', '3' ],
            government: {
                majority: [ '0', '1', '2', '3' ],
                minority: [ '4', ]
            }
        }, 'shrink minority to five member parliament')
        assert(stuff(denizen, {
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2', '3' ],
                minority: [ '4' ]
            },
            ponged: [ '0', '1', '2', '3', '4' ]
        })._shrink(), {
            quorum: [ '0', '1', '2', '3' ],
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '4', '3', ]
            }
        }, 'shrink to five member parliament')
        assert(stuff(denizen, {
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3' ]
            },
            ponged: [ '0', '1', '2', '3' ]
        })._shrink(), {
            quorum: [ '0', '1', '2' ],
            government: {
                majority: [ '0', '1', '2' ],
                minority: []
            }
        }, 'shrink minority to three member parliament')
        assert(stuff(denizen, {
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1', '2' ],
                minority: []
            },
            ponged: [ 0, 1, 2 ]
        })._shrink(), {
            quorum: [ '0', '1', '2' ],
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ]
            }
        }, 'shrink majority of three member parliament')
        assert(stuff(denizen, {
            id: '0',
            timeout: 2,
            government: {
                majority: [ '0', '1' ],
                minority: []
            },
            ponged: [ 0, 1 ]
        })._shrink(), {
            quorum: [ '0', '1' ],
            government: {
                majority: [ '0' ],
                minority: []
            }
        }, 'drop down to dictator')
    } ()

    ! function () {
        var denizen = new Paxos('1', {})

        assert(stuff(denizen, {
            timeout: 2,
            government: {
                constituents: [ '3', '4' ]
            },
            ponged: [ 3, 4 ]
        })._exile(), null, 'exile all good')
        assert(stuff(denizen, {
            timeout: 2,
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ],
                constituents: [ '3', '4' ]
            },
            pings: {
                3: { timeout: 0 },
                4: { timeout: 2 }
            }
        })._exile(), {
            quorum: [ '0', '1' ],
            government: {
                majority: [ '0', '1' ],
                minority: [ '2' ],
                exile: { id: '4' }
            }
        }, 'exile')
    } ()

    ! function () {
        var denizen
        Paxos.prototype._determineConstituency.call(denizen = {
            id: '1',
            government: {
                majority: [ '1' ],
                minority: [],
                constituents: [ '2', '3' ]
            }
        })
        assert(denizen.constituency, [ '2', '3' ], 'constituency dictator')
        Paxos.prototype._determineConstituency.call(denizen = {
            id: '2',
            government: {
                majority: [ '1' ],
                minority: [],
                constituents: [ '2', '3' ]
            }
        })
        assert(denizen.constituency, [], 'constituency not in government')
        Paxos.prototype._determineConstituency.call( denizen = {
            id: '3',
            government: {
                majority: [ '1', '2','3' ],
                minority: [ '4', '5' ],
                constituents: [ '6' ]
            }
        })
        assert(denizen.constituency, [ '5' ], 'majority constituent in minority')
        Paxos.prototype._determineConstituency.call( denizen = {
            id: '3',
            government: {
                majority: [ '1', '2','3' ],
                minority: [ '4' ],
                constituents: [ '6' ]
            }
        })
        assert(denizen.constituency, [], 'majority constituent in minority missing')
        Paxos.prototype._determineConstituency.call(denizen = {
            id: '1',
            government: {
                majority: [ '1', '2', '3', '4' ],
                minority: [ '5', '6' ],
                constituents: [ '4' ]
            },
        })
        assert(denizen.constituency, [], 'no constituents leader')
        Paxos.prototype._determineConstituency.call(denizen = {
            id: '2',
            government: {
                majority: [ '1', '2', '3' ],
                minority: [],
                constituents: [ '6', '7' ]
            }
        })
        assert(denizen.constituency, [ '6' ], 'majority with citizen constituents')
    } ()
}
