require('proof')(11, function (assert) {
    var Identifer = require('../../identifier')

    assert(new Identifer('1fffffffff').words, [ 0x1f, 0xffffffff ], 'parse two words')
    assert(new Identifer('ffffffff').words, [ 0xffffffff ], 'parse one word')
    assert(new Identifer().words, [ 0x0 ], 'default')
    assert(new Identifer([ 0x1, 0x1 ]).words, [ 0x1, 0x1 ], 'default')

    var ids = [ new Identifer('1ffffffff'), new Identifer('ffffffff'), new Identifer('1fffffffe') ]

    assert(ids[0].compare(ids[1]) > 0, 'compare longer')
    assert(ids[0].compare(ids[2]) > 0, 'compare lesser')
    assert(ids[0].compare(ids[0]) == 0, 'compare equal')

    assert(ids[0].increment().compare(new Identifer('200000000')) == 0, 'carry')
    assert(ids[1].increment().compare(new Identifer('100000000')) == 0, 'carry unshift')
    assert(ids[2].increment().compare(ids[0]) == 0, 'no carry')

    assert(String(ids[0]), '1ffffffff', 'to string')
})
