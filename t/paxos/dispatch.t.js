require('proof')(1, function (assert) {
    var Legislator = require('../../legislator')
    var legislator = {
        id: 0,
        receiveDummy: function () {
            return [
                { type: 'bogus', to: [ 0 ], from: [ 1 ], id: [ 1 ] },
                { type: 'bogus', to: [ 1 ], from: [ 0 ], id: [ 1 ] },
                { type: 'bogus', to: [ 0 ], from: [ 1 ], id: [ 1 ] },
                { type: 'bogus', to: [ 1 ], from: [ 0 ], id: [ 1 ] }
            ]
        }
    }
    var messages = Legislator.dispatch([
        { type: 'dummy', from: [ 1 ], to: [ 0 ], forward: [ 1, 2 ], id: [ 1 ] },
        { type: 'other', from: [ 2 ], to: [ 1 ], id: [ 2 ] }
    ], [ legislator ])
    console.log(messages)
})
