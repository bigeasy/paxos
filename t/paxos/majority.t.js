require('proof')(6, function (assert) {
    var Legislator = require('../../legislator')

    var legislator = new Legislator('0')

    assert(legislator.majoritySize(5, 1), 1, 'one')
    assert(legislator.majoritySize(5, 2), 2, 'two')
    assert(legislator.majoritySize(5, 3), 2, 'three')
    assert(legislator.majoritySize(5, 4), 3, 'four')
    assert(legislator.majoritySize(5, 5), 3, 'five')
    assert(legislator.majoritySize(5, 6), 3, 'six')
})
