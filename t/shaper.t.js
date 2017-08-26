require('proof')(12, prove)

function prove (okay) {
    var Shaper = require('../shaper')
    var shaper

    shaper = new Shaper(5, {
        promise: '0/0',
        majority: [],
        minority: []
    })

    shaper = new Shaper(5, {
        majority: [ '0', '1', '2' ],
        minority: [ '3', '4' ],
        constituents: []
    })

    var reshape

    okay(shaper.update('0', true), null, 'ignore majority')

    okay(shaper.update('0', true), null, 'seen')

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

    shaper = shaper.createShaper({
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

    shaper = shaper.createShaper({
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

    shaper = shaper.createShaper({
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

    shaper = shaper.createShaper({
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

    shaper = shaper.createShaper({
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

    shaper = shaper.createShaper({
        parliamentSize: 5,
        government: {
            majority: [ '0' ],
            minority: [],
            constituents: [ '1', '4', '5' ]
        }
    })

    shaper.immigrated('6')

    okay({
        zero: shaper.update('0', true),
        one: shaper.update('1', true),
        four: shaper.update('4', true)
    }, {
        zero: null,
        one: null,
        four: {
            quorum: [ '0', '1' ],
            government: {
                majority: [ '0', '1' ],
                minority: [ '4' ]
            }
        }
    }, 'expand')
}
