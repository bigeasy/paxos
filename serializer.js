function set (array, value) {
    if (!~array.indexOf(value)) {
        array.push(value)
    }
}

exports.flatten = function (envelopes) {
    var seen = {}, flattened = []
    envelopes.forEach(function (envelope) {
        var message = seen[envelope.message.id]
        if (!message) {
            seen[envelope.message.id] = message = {}
            for (var key in envelope.message) {
                message[key] = envelope.message[key]
            }
            message.from = []
            message.to = []
            message.route = envelope.route
            flattened.push(message)
        }
        set(message.to, envelope.to)
        set(message.from, envelope.from)
    })
    return flattened
}

exports.expand = function (messages) {
    var expanded = []
    messages.forEach(function (message) {
        var to = message.to, from = message.from, route = message.route
        delete message.from
        delete message.to
        delete message.route
        to.forEach(function (to) {
            from.forEach(function (from) {
                expanded.push({
                    from: from,
                    to: to,
                    route: route,
                    message: message
                })
            })
        })
    })
    return expanded
}
