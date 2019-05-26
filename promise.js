exports.toString = function (promise) {
    return `${promise[0].toString(16)}/${promise[1].toString(16)}`
}

exports.splitPromise = function (string) {
    return string.split('/').map(part => parseInt(part, 16))
}

exports.isGovernment = function (string) {
    return /^[0-9a-f]+\/0$/.test(string)
}

exports.nextGovernment = function (string) {
    const promise = exports.splitPromise(string)
    promise[0]++
    return exports.toString(promise)
}

exports.nextIndex = function (string) {
    const promise = exports.splitPromise(string)
    promise[1]++
    return exports.toString(promise)
}

exports.compare = function (left, right) {
    const promises = [ exports.splitPromise(left), exports.splitPromise(right) ]
    const compare = promises[0][0] - promises[1][0]
    if (compare == 0) {
        return promises[0][1] - promises[1][1]
    }
    return compare
}
