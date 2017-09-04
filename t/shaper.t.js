require('proof')(14, prove)

function prove (okay) {
    var Shaper = require('../shaper')
    var shaper

    shaper = new Shaper(5, {
        promise: '0/0',
        majority: [],
        minority: []
    })

    shaper.received()

    shaper = new Shaper(5, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [ '3', '4' ]
    })

    var reshape

    okay(shaper.update('0', true), null, 'ignore majority')

    okay(shaper.update('0', true), null, 'seen')

    okay(shaper.update('3', true), null, 'not enough to expand')
    okay(shaper.update('2', true), null, 'ignore minority to expand')
    okay(shaper.update('4', true), {
        quorum: [ '0', '1', '2' ],
        government: {
            majority: [ '0', '1', '2' ],
            minority: [ '3', '4' ]
        }
    }, 'expand to parliament size')

    shaper = createShaper(shaper, {
        parliamentSize: 5,
        government: {
            majority: [ '0', '1', '2' ],
            minority: [ '3', '4' ],
            constituents: []
        }
    })

    okay(shaper.update('4', true), null, 'copacetic')

    okay(shaper.update('3', false), {
        quorum: [ '0', '1', '2' ],
        government: {
            majority: [ '0', '1', '2' ],
            minority: [ '4' ],
            exile: '3'
        }
    }, 'exile')

    shaper.decided = true

    okay(shaper.update('3', false), null, 'decided')

    var reshape = shaper.immigrate({ id: '5', cookie: 0, properties: { location: '5' } })

    okay(reshape, null, 'immigrate decided')

    shaper.immigrate({ id: '6', cookie: 0, properties: { location: null } })
    shaper.immigrate({ id: '6', cookie: 1, properties: { location: '6' } })

    function createShaper (shaper, paxos) {
        var newShaper = new Shaper(paxos.parliamentSize, paxos.government)
        for (var i = 0, immigration; (immigration = shaper._immigrating[i]) != null; i++) {
            newShaper.immigrate(immigration)
        }
        return newShaper
    }

    shaper = createShaper(shaper, {
        parliamentSize: 5,
        government: {
            majority: [ '0', '1', '2' ],
            minority: [ '4' ],
            constituents: []
        }
    })

    reshape = shaper.update('4', false)

    okay(reshape, {
        quorum: [ '0', '1', '2' ],
        government: {
            majority: [ '0', '1' ],
            minority: [ '2' ]
        }
    }, 'shrink to three')

    shaper = createShaper(shaper, {
        parliamentSize: 5,
        government: {
            majority: [ '0', '1' ],
            minority: [ '3' ],
            constituents: [ '4' ]
        }
    })

    reshape = shaper.update('3', false)

    okay(reshape, {
        quorum: [ '0', '1' ],
        government: {
            majority: [ '0', '1' ],
            minority: [],
            exile: '3'
        }
    }, 'second exile')

    shaper = createShaper(shaper, {
        parliamentSize: 5,
        government: {
            majority: [ '0', '1' ],
            minority: [],
            constituents: [ '4' ]
        }
    })

    reshape = shaper.update('0', true)

    okay(reshape, {
        quorum: [ '0', '1' ],
        government: {
            majority: [ '0' ],
            minority: []
        }
    }, 'shrink to one')

    shaper = createShaper(shaper, {
        parliamentSize: 5,
        government: {
            majority: [ '0' ],
            minority: [],
            constituents: [ '1', '4' ]
        }
    })

    reshape = shaper.update('0', true)

    okay(reshape, {
        quorum: [ '0' ],
        government: {
            majority: [ '0' ],
            minority: [],
            immigrate: { id: '5', cookie: 0, properties: { location: '5' } }
        }
    }, 'immigration ')

    shaper = createShaper(shaper, {
        parliamentSize: 5,
        government: {
            majority: [ '0' ],
            minority: [],
            constituents: [ '1', '4', '5' ]
        }
    })

    shaper.immigrated('5')

    reshape = shaper.update('0', true)

    okay(reshape, {
        quorum: [ '0' ],
        government: {
            majority: [ '0' ],
            minority: [],
            immigrate: { id: '6', cookie: 1, properties: { location: '6' } }
        }
    }, 'updated immigration')
}
