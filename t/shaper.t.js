require('proof')(10, prove)

function prove (okay) {
    var Shaper = require('../shaper')
    var shaper

    shaper = new Shaper(7, {
        majority: [ '0', '1', '2', '3' ],
        minority: [ '4', '5', '6' ],
        constituents: []
    })

    var reshape

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
}
