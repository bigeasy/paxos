require('proof')(7, prove)

function prove (okay) {
    var Assembly = require('../assembly')
    var assembly = new Assembly({
        majority: [ '0', '1', '2' ],
        minority: [ '3', '4' ]
    }, '2')
    okay(assembly.update('2', true), null, 'first')
    okay(assembly.update('3', true), null, 'second reachable')
    okay(assembly.update('3', true), null, 'second still reachable')
    okay(assembly.update('3', false), null, 'second unreachable')
    okay(assembly.update('3', false), null, 'second still unreachable')
    okay(assembly.update('3', true), null, 'second rereachable')
    okay(assembly.update('4', true), {
        quorum: [ '2', '3', '4' ],
        government: {
            majority: [ '2', '3', '4' ],
            minority: [ '0', '1' ]
        }
    }, 'third reachable')
}
