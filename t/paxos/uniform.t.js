
require('proof')(1, prove)

function prove (assert) {
    var Legislator = require('../../legislator')

    var legislator = new Legislator('0')

    legislator.bootstrap()

    for (var i = 2; i < 5; i++) {
        var entry = legislator.entry(i + '/0', {
            id: i + '/0',
            quorum: [ 0 ],
            value: {
                type: 'convene',
                government: {
                    id: i + '/0',
                    majority: [ 0 ],
                    minority: [],
                    constituents: []
                },
                terminus: (i - 1) + '/0'
            },
            internal: true,
            promises: [ 0 ]
        })
        entry.learns = [ 0 ]
    }

    legislator.log.max().decided = true

    legislator.playUniform()

    assert(legislator.entry('2/0', {}).uniform, 'terminus uniform linked list')
}
