var assert = require('assert')

exports.explode = function (government, entry) {
    if (entry.exile != null) {
        entry.exile = {
            id: entry.exile,
            promise: government.immigrated.promise[entry.exile],
            properties: government.properties[entry.exile],
            index: {}
        }
        var index = government.constituents.indexOf(entry.exile.id)
        if (~index) {
            entry.exile.index.constituents = index
        }
        index = government.naturalized.indexOf(entry.exile.id)
        if (~index) {
            entry.exile.index.naturalized = index
        }
    } else if (entry.promote != null) {
        for (var i = 0, id; (id = entry.promote[i]) != null; i++) {
            entry.promote[i] = { id: id, index: government.constituents.indexOf(id) }
        }
        entry.promote.sort(function (left, right) { return right.index - left.index })
    }
    return entry
}

exports.advance = function (government, entry) {
    government.promise = entry.promise
    government.majority = entry.body.majority
    government.minority = entry.body.minority
    if (entry.body.immigrate != null) {
        if (entry.promise == '1/0') {
            government.majority.push(entry.body.immigrate.id)
        } else {
            government.constituents.push(entry.body.immigrate.id)
        }
        government.immigrated.id[government.immigrated.promise[entry.body.immigrate.id]]
        government.immigrated.promise[entry.body.immigrate.id] = entry.promise
        government.immigrated.id[entry.promise] = entry.body.immigrate.id
        government.properties[entry.body.immigrate.id] = entry.body.immigrate.properties
    } else if (entry.body.exile != null) {
        delete government.immigrated.id[government.immigrated.promise[entry.body.exile.id]]
        delete government.immigrated.promise[entry.body.exile.id]
        delete government.properties[entry.body.exile.id]
        if ('constituents' in entry.body.exile.index) {
            government.constituents.splice(entry.body.exile.index.constituents, 1)
        }
        if ('naturalized' in entry.body.exile.index) {
            government.naturalized.splice(entry.body.exile.index.naturalized, 1)
        }
    } else if (entry.body.promote != null) {
        for (var i = 0, promotion; (promotion = entry.body.promote[i]) != null; i++) {
            government.constituents.splice(promotion.index, 1)
        }
    } else if (entry.body.demote != null) {
        government.constituents.unshift(entry.body.demote)
    }
    if (entry.body.naturalize != null) {
        government.naturalized.push(entry.body.naturalize)
    }
    return government
}
