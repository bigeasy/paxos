const ascension = require('ascension')
const whittle = require('whittle')

const Monotonic = {
    toBigInt: promise => promise.split('/').map(part => BigInt(`0x${part}`)),
    compare: whittle(ascension([ BigInt, BigInt ]), promise => Monotonic.toBigInt(promise)),
    isGovernment: promise => promise.endsWith('/0'),
    increment: (promise, index) => {
        const split = Monotonic.toBigInt(promise)
        split[index] += 1n
        return split.map(part => part.toString(16)).join('/')
    }
}

module.exports = Monotonic
