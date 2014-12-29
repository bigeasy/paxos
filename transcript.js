var Transcript = require('transcript'),
    transcript = new Transcript

exports.serialize = function (route, index, messages) {
    var writer = transcript.createWriter(), output
    writer.output().end(JSON.stringify({ route: route, index: index, count: messages.length }))
    messages.forEach(function (message) {
        writer.output().end(JSON.stringify(message))
    })
    writer.end()
    return writer.buffers()
}

exports.deserialize = function (buffers) {
    var reader = transcript.createReader(), input
    buffers.forEach(function (buffer) {
        reader.push(buffer)
    })
    input = reader.read()
    var header = JSON.parse(input.body.toString()), messages = []
    while (input = reader.read()) {
        messages.push(JSON.parse(input.body.toString()))
    }
    return { route: header.route, index: header.index, messages: messages }
}
