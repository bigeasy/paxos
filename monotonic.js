const whittle = require('whittle')

const Monotonic = {
    toBigInt: promise => promise.split('/').map(part => BigInt(`0x${part}`)),
    compare: whittle(function (left, right) {
        for (let i = 0, I = Math.min(left.length, right.length); i < I; i++) {
            const compare = (left[i] > right[i]) - (left[i] < right[i])
            if (compare != 0) {
                return compare
            }
        }
        return left.length - right.length
    }, promise => Monotonic.toBigInt(promise)),
    isGovernment: promise => promise.endsWith('/0'),
    incrementr: (promise, index) => {
        const split = Monotonic.toBigInt(promise).reverse()
        split[index] += 1n
        return split.map(part => part.toString(16)).join('/')
    },
    increment: (promise, index) => {
        const split = Monotonic.toBigInt(promise)
        split[index] += 1n
        return split.map(part => part.toString(16)).join('/')
    }
}

module.exports = Monotonic
