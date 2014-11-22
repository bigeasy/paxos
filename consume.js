module.exports = function (array, f, context) {
    var index = 0
    while (index < array.length) {
        if (f.call(context, array[index])) { array.splice(index, 1) }
        else { index++ }
    }
}
