require('proof')(1, prove)

function prove (assert) {
    var Legislator = require('../../legislator')
    var legislator = new Legislator('1')
    assert(legislator, 'default constructor')
}
