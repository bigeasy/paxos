require('proof')(8, prove)

function prove (okay) {
    var constituency = require('../constituency')
    okay(constituency({
        majority: [ '0' ],
        minority: [],
        constituents: [ '1' ]
    }, '0', {}), {
        constituency: [ '1' ],
        representative: null
    }, 'dictator self')
    okay(constituency({
        majority: [ '0' ],
        minority: [],
        constituents: [ '1' ]
    }, '1', {}), {
        constituency: [],
        representative: '0'
    }, 'dictator follower')
    var government = {
        majority: [ '0', '1', '2' ],
        minority: [ '3', '4' ],
        constituents: [ '5', '6' ]
    }
    okay(constituency(government, '0', {}), {
        constituency: [],
        representative: null
    }, 'leader constituents')
    okay(constituency(government, '1', {}), {
        constituency: [ '3' ],
        representative: '0'
    }, 'majority constituents')
    okay(constituency(government, '3', {}), {
        constituency: [ '5' ],
        representative: '1'
    }, 'minority constituents')
    okay(constituency(government, '5', {}), {
        constituency: [],
        representative: '3'
    }, 'constituent representative')
    government.minority = []
    okay(constituency(government, '1', {}), {
        constituency: [ '5' ],
        representative: '0'
    }, 'majority constituents no minority')
    okay(constituency(government, '5', {}), {
        constituency: [],
        representative: '1'
    }, 'constituent representative no minority')
}
