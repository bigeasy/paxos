require('proof')(17, prove)

function prove (okay) {
    var Shaper = require('../shaper')
    var shaper

    shaper = new Shaper(7, {
        majority: [ '0', '1', '2', '3' ],
        minority: [ '4', '5', '6' ],
        constituents: []
    })

    var reshape

    okay(shaper.update('0', true), null, 'ignore majority')

    reshape = shaper.update('5', true)

    okay(reshape, null, 'minority present no-op')

    reshape = shaper.update('5', true)

    okay(reshape, null, 'okay seen')

    reshape = shaper.update('4', false)

    okay(reshape, {
        quorum: [ '0', '1', '2', '3' ],
        government: {
            majority: [ '0', '1', '2', '3' ],
            minority: [ '5', '6' ]
        }
    }, 'impeach')

    shaper = new Shaper(7, {
        majority: reshape.government.majority,
        minority: reshape.government.minority,
        constituents: [ '4' ]
    })

    reshape = shaper.update('5', false)

    okay(reshape, {
        quorum: [ '0', '1', '2', '3' ],
        government: {
            majority: [ '0', '1', '2', '3' ],
            minority: [ '6' ]
        }
    }, 'impeach again')

    shaper = new Shaper(7, {
        majority: reshape.government.majority,
        minority: reshape.government.minority,
        constituents: [ '4', '5' ]
    })

    reshape = shaper.update('6', false)

    okay(reshape, {
        quorum: [ '0', '1', '2', '3' ],
        government: {
            majority: [ '0', '1', '2', '3' ],
            minority: []
        }
    }, 'impeach yet again')

    shaper = new Shaper(7, {
        majority: reshape.government.majority,
        minority: reshape.government.minority,
        constituents: [ '4', '5', '6' ]
    })

    reshape = shaper.update('6', false)

    okay(reshape, {
        quorum: [ '0', '1', '2', '3' ],
        government: {
            majority: [ '0', '1', '2' ],
            minority: [ '3' ]
        }
    }, 'shrink')

    shaper = new Shaper(7, {
        majority: reshape.government.majority,
        minority: reshape.government.minority,
        constituents: [ '4', '5', '6' ]
    })

    okay([
        shaper.update('6', false),
        shaper.update('5', false)
    ], [ null, null ], 'not ready to shrink again')

    reshape = shaper.update('4', false)

    okay(reshape, {
        quorum: [ '0', '1', '2' ],
        government: {
            majority: [ '0', '1' ],
            minority: [ '2' ]
        }
    }, 'shrink again')

    shaper = new Shaper(7, {
        majority: reshape.government.majority,
        minority: reshape.government.minority,
        constituents: [ '4', '5', '6' ]
    })

    okay(shaper.update('2', true), null, 'no exile yet')

    reshape = shaper.update('4', false)

    okay(reshape, {
        quorum: [ '0', '1' ],
        government: {
            majority: [ '0', '1' ],
            minority: [ '2' ],
            exile: '4'
        }
    }, 'exile')

    shaper.decided = true

    okay(shaper.update('5', true), null, 'decided')

    shaper = new Shaper(5, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [ '3', '4', '5' ]
    })

    okay({
        two: shaper.update('2', true),
        three: shaper.update('3', true),
        four: shaper.update('4', true)
    }, {
        two: null,
        three: null,
        four: {
            quorum: [ '0', '1', '2' ],
            government: {
                majority: [ '0', '1', '2' ],
                minority: [ '3', '4' ]
            }
        }
    }, 'expand')

    shaper = new Shaper(5, {
        majority: [ '0', '1' ],
        minority: [],
        constituents: [ '3', '4', '5' ]
    })

    okay(shaper.update('3', true), {
        quorum: [ '0', '1' ],
        government: {
            majority: [ '0', '1' ],
            minority: [ '3' ]
        }
    }, 'fill seat')

    shaper = new Shaper(5, {
        majority: [ '0', '1', '3' ],
        minority: [ '4', '5' ],
        constituents: [ '6' ]
    })

    okay({
        zero: shaper.update('0', true),
        one: shaper.update('1', true),
        two: shaper.update('2', true),
        three: shaper.update('3', true),
        four: shaper.update('4', true),
        five: shaper.update('5', true),
        six: shaper.update('6', true)
    }, {
        zero: null,
        one: null,
        two: null,
        three: null,
        four: null,
        five: null,
        six: null
    }, 'no change')

    shaper = new Shaper(5, {
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: []
    })

    shaper.immigrate({
        id: '3',
        cookie: 0,
        properties: { location: '3' }
    })

    shaper.immigrate({
        id: '4',
        cookie: 0,
        properties: null
    })

    shaper.immigrate({
        id: '4',
        cookie: 1,
        properties: { location: '4' }
    })

    okay(shaper.update('2', true), {
        quorum: [ '0', '1' ],
        government: {
            majority: [ '0', '1' ],
            minority: [ '2' ],
            immigrate: { id: '3', properties: { location: '3' }, cookie: 0 }
        }
    }, 'immigrate wait for minority')

    shaper.immigrated('3')

    shaper = shaper.createShaper({
        parliamentSize: 5,
        government: {
            majority: [ '0', '1' ],
            minority: [ '2' ],
            constituents: [ '3' ]
        }
    })

    okay(shaper.update('2', true), {
        quorum: [ '0', '1' ],
        government: {
            majority: [ '0', '1' ],
            minority: [ '2' ],
            immigrate: { id: '4', properties: { location: '4' }, cookie: 1 }
        }
    }, 'immigrate updated')
}
