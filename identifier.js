function Identifier (words) {
    if (Array.isArray(words)) {
        this.words = words.slice()
    } else if (typeof words == 'string') {
        var padding = 8 - (words.length & 0x7)
        if (padding != 8) {
            words = '00000000'.substring(0, padding) + words
        }
       this.words = words.match(/(.{1,8})/g).map(function (word) {
            return parseInt(word, 16)
        })
    } else {
        this.words = [ 0 ]
    }
}

Identifier.prototype.increment = function () {
    var words = this.words.slice()
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
    return new Identifier(words)
}

Identifier.prototype.compare = function (that) {
    var compare = this.words.length - that.words.length
    if (!compare) {
        var these = this.words, those = that.words
        for (var i = 0, I = these.length; i < I; i++) {
            compare = these[i] - those[i]
            if (compare) {
                return compare
            }
        }
    }
    return compare
}

Identifier.prototype.toString = function () {
    var words = this.words, string = [ words[0].toString(16) ]
    for (var i = 1, I = words.length; i < I; i++) {
        string.push(('00000000000' + words[i].toString(16)).substr(-8))
    }
    return string.join('')
}

module.exports = Identifier
