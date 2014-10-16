var push = [].push

exports.dispatch = function (messages, participants) {
    var responses = []
    messages.forEach(function (message) {
        var type = message.type
        var method = 'receive' + type[0].toUpperCase() + type.substring(1)
        participants.forEach(function (participant) {
            if (typeof participant[method] == 'function') {
                push.apply(responses, participant[method](message))
            }
        })
    })
    return responses
}
