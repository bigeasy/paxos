require('proof')(10, function (assert) {
    var Id = require('../../identifier')

    assert(Id.parse('1fffffffff'), [ 0x1f, 0xffffffff ], 'parse two words')
    assert(Id.parse('ffffffff'), [ 0xffffffff ], 'parse one word')

    var ids = [ Id.parse('1ffffffff'), Id.parse('ffffffff'), Id.parse('1fffffffe') ]

    assert(Id.compare(ids[0], ids[1]) > 0, 'compare longer')
    assert(Id.compare(ids[0], ids[2]) > 0, 'compare lesser')
    assert(Id.compare(ids[0], ids[0]) == 0, 'compare equal')

    assert(Id.compare(Id.increment(ids[0]), [ 0x2, 0x0 ]) == 0, 'carry')
    assert(Id.compare(Id.increment(ids[1]), [ 0x1, 0x0 ]) == 0, 'carry unshift')
    assert(Id.compare(Id.increment(ids[2]), ids[0]) == 0, 'no carry')

    assert(Id.toString(ids[0]), '1ffffffff', 'to string')
    assert(Id.toString(ids[0], 64), '00000001ffffffff', 'to string')
})
