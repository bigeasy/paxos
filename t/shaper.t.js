require('proof')(2, prove)

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

    okay(shaper.update('0', true), null, 'seen')
}
