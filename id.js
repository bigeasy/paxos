var Monotonic = require('monotonic')

var Id = {
    toWords: function (id) {
        var split = id.split('/')
        return [ Monotonic.parse(split[0]), Monotonic.parse(split[1]) ]
    },
    toString: function (id) {
        return Monotonic.toString(id[0]) + '/' + Monotonic.toString(id[1])
    },
    compare: function (a, b, index) {
        a = Id.toWords(a)
        b = Id.toWords(b)
        if (index == null) {
            var compare = Monotonic.compare(a[0], b[0])
            if (compare == 0) {
                return Monotonic.compare(a[1], b[1])
            }
            return compare
        }
        return Monotonic.compare(a[index], b[index])
    },
    increment: function (id, index) {
        id = Id.toWords(id)
        var next = [ id[0], id[1] ]
        next[index] = Monotonic.increment(next[index])
        if (index == 0) {
            next[1] = [ 0 ]
        }
        return Id.toString(next)
    },
    isGovernment: function (id) {
        return Id.compare('0/0', id, 1) == 0
    }
}

module.exports = Id
