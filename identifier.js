exports.parse = function (string) {
    var padding = 8 - (string.length & 0x7)
    if (padding != 8) {
        string = '00000000'.substring(0, padding) + string
    }
    return string.match(/(.{1,8})/g).map(function (word) {
        return parseInt(word, 16)
    })
}

exports.increment = function (words) {
    var words = words.slice()
    for (var i = words.length - 1; i != -1; i--) {
        if (words[i] == 0xffffffff) {
            words[i] = 0
        } else {
            words[i]++
            break
        }
    }
    if (words[0] == 0) {
        words.unshift(0x1)
    }
    return words
}

exports.compare = function (these, those) {
    var compare = these.length - those.length
    if (!compare) {
        for (var i = 0, I = these.length; i < I; i++) {
            compare = these[i] - those[i]
            if (compare) {
                return compare
            }
        }
    }
    return compare
}

exports.toString = function (words, bits) {
    var string = [ words[0].toString(16) ]
    for (var i = 1, I = words.length; i < I; i++) {
        string.push(('00000000000' + words[i].toString(16)).substr(-8))
    }
    var string = string.join('')
    if (bits) {
        words = bits / 4
        return (new Array(words).join('0') + string).substr(-words)
    }
    return string
}
