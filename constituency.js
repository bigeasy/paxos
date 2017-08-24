module.exports = function (government, id, paxos) {
    var parliament = government.majority.concat(government.minority), index
    if (parliament.length == 1) {
        if (id == government.majority[0]) {
            paxos.constituency = government.constituents
            paxos.representative = null
        } else {
            paxos.constituency = []
            paxos.representative = government.majority[0]
        }
    } else if (government.majority[0] == id) {
        paxos.constituency = government.majority.slice(1)
        paxos.representative = null
    } else {
        var majority = government.majority.slice(1)
        var index = majority.indexOf(id)
        if (~index) {
            var length = majority.length
            var population = government.minority.length == 0 ? government.constituents : government.minority
            paxos.constituency = population.filter(function (id, i) { return i % length == index })
            paxos.representative = government.majority[0]
        } else if (~(index = government.minority.indexOf(id))) {
            var length = government.minority.length
            paxos.constituency = government.constituents.filter(function (id, i) {
                return i % length == index
            })
            var length = majority.length
            paxos.representative = government.majority.slice(1).filter(function (id, i) {
                return index % length == i
            }).shift()
        } else {
            var index = government.constituents.indexOf(id)
            var representatives = government.minority.length == 0 ? majority : government.minority
            var length = representatives.length
            paxos.constituency = []
            paxos.representative = representatives.filter(function (id, i) {
                return index % length == i
            }).shift()
        }
    }
    return paxos
}
