module.exports = function (government, id) {
    var outcome = {
        constituency: [],
        representative: null
    }, index
    var parliament = government.majority.concat(government.minority), index
    if (parliament.length == 1) {
        if (id == government.majority[0]) {
            outcome.constituency = government.constituents
        } else {
            outcome.representative = government.majority[0]
        }
    } else if (government.majority[0] == id) {
        outcome.constituency = government.majority.slice(1)
    } else {
        var majority = government.majority.slice(1)
        var index = majority.indexOf(id)
        if (~index) {
            var length = majority.length
            var population = government.minority.length == 0 ? government.constituents : government.minority
            outcome.constituency = population.filter(function (id, i) { return i % length == index })
            outcome.representative = government.majority[0]
        } else if (~(index = government.minority.indexOf(id))) {
            var length = government.minority.length
            outcome.constituency = government.constituents.filter(function (id, i) {
                return i % length == index
            })
            var length = majority.length
            outcome.representative = government.majority.slice(1).filter(function (id, i) {
                return index % length == i
            }).shift()
        } else {
            var index = government.constituents.indexOf(id)
            var representatives = government.minority.length == 0 ? majority : government.minority
            var length = representatives.length
            outcome.representative = representatives.filter(function (id, i) {
                return index % length == i
            }).shift()
        }
    }
    return outcome
}
