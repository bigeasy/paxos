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

function register (government, record, promise) {
    government.immigrated.id[government.immigrated.promise[record.id]]
    government.immigrated.promise[record.id] = promise
    government.immigrated.id[promise] = record.id
    government.properties[record.id] = record.properties
}

function unregister (government, id) {
    delete government.immigrated.id[government.immigrated.promise[id]]
    delete government.immigrated.promise[id]
    delete government.properties[id]
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
        register(government, entry.body.immigrate, entry.promise)
    } else if (entry.body.exile != null) {
        unregister(government, entry.body.exile.id)
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

exports.retreat = function (government, entry, previous) {
    government.promise = previous.promise
    government.majority = previous.body.majority
    government.minority = previous.body.minority
    if (entry.body.immigrate != null) {
        assert(government.constituents.pop() == entry.body.immigrate.id, 'unexpected immigration retreat')
        unregister(government, entry.body.immigrate.id)
    } else if (entry.body.exile != null) {
        if (entry.body.exile.index.constituents != null) {
            government.constituents.splice(entry.body.exile.index.constituents, 0, entry.body.exile.id)
        }
        if (entry.body.exile.index.naturalized != null) {
            government.naturalized.splice(entry.body.exile.index.naturalized, 0, entry.body.exile.id)
        }
        register(government, entry.body.exile, entry.body.exile.promise)
    } else if (entry.body.promote != null) {
        var promote = entry.body.promote.slice().reverse()
        for (var i = 0, promotion; (promotion = promote[i]) != null; i++) {
            government.constituents.splice(promotion.index, 0, promotion.id)
        }
    } else if (entry.body.demote != null) {
        assert(government.constituents.shift() == entry.body.demote, 'exile wrong demotion')
    }
    if (entry.body.naturalize != null) {
        assert(government.naturalized.pop() == entry.body.naturalize, 'exile wrong naturalize')
    }
    return government
}
