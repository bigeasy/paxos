require('proof')(8, prove)

function prove (okay) {
    var Shape = require('../shape')
    var shape

    shape = new Shape(7, {
        majority: [ '0', '1', '2', '3' ],
        minority: [ '4', '5', '6' ],
        constituents: []
    })

    var reshape

    reshape = shape.update('5', true)

    okay(reshape, null, 'minority present no-op')

    reshape = shape.update('5', true)

    okay(reshape, null, 'okay seen')

    reshape = shape.update('4', false)

    okay(reshape, {
        quorum: [ '0', '1', '2', '3' ],
        government: {
            majority: [ '0', '1', '2', '3' ],
            minority: [ '5', '6' ]
        }
    }, 'impeach')

    shape = new Shape(7, {
        majority: reshape.government.majority,
        minority: reshape.government.minority,
        constituents: [ '4' ]
    })

    reshape = shape.update('5', false)

    okay(reshape, {
        quorum: [ '0', '1', '2', '3' ],
        government: {
            majority: [ '0', '1', '2', '3' ],
            minority: [ '6' ]
        }
    }, 'impeach again')

    shape = new Shape(7, {
        majority: reshape.government.majority,
        minority: reshape.government.minority,
        constituents: [ '4', '5' ]
    })

    reshape = shape.update('6', false)

    okay(reshape, {
        quorum: [ '0', '1', '2', '3' ],
        government: {
            majority: [ '0', '1', '2', '3' ],
            minority: []
        }
    }, 'impeach yet again')

    shape = new Shape(7, {
        majority: reshape.government.majority,
        minority: reshape.government.minority,
        constituents: [ '4', '5', '6' ]
    })

    reshape = shape.update('6', false)

    okay(reshape, {
        quorum: [ '0', '1', '2', '3' ],
        government: {
            majority: [ '0', '1', '2' ],
            minority: [ '3' ]
        }
    }, 'shrink')

    shape = new Shape(7, {
        majority: reshape.government.majority,
        minority: reshape.government.minority,
        constituents: [ '4', '5', '6' ]
    })


    okay([
        shape.update('6', false),
        shape.update('5', false)
    ], [ null, null ], 'not ready to shrink again')

    okay(reshape, {
        quorum: [ '0', '1', '2', '3' ],
        government: {
            majority: [ '0', '1', '2' ],
            minority: [ '3' ]
        }
    }, 'shrink again')
}
