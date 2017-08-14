require('proof')(2, prove)

function prove (okay) {
    var Writer = require('../writer')
    var Recorder = require('../recorder')

    var writer = new Writer({
        _send: function (request) {
            var responses = {}
            request.to.forEach(function (id) {
                responses[id] = recorders[id].request(0, request, {})
            })
            writer.response(0, request, responses)
        }
    }, '1/0')
    var entries = [ [], [] ]
    var recorders = [ '0', '1' ].map(function (id) {
        return new Recorder({
            promise: '1/0',
            _commit: function (now, entry) {
                entries[id].push(entry)
            }
        })
    })

    okay(writer.version, [ '1/0', false ], 'version')

    Array.prototype.push.apply(writer.proposals, [{
        promise: '1/1',
        quorum: [ '0', '1' ],
        body: 1
    }, {
        promise: '1/2',
        quorum: [ '0', '1' ],
        body: 2
    }, {
        promise: '2/0',
        quorum: [ '0', '1' ],
        body: 3
    }, {
        promise: '2/1',
        quorum: [ '0', '1' ],
        body: 4
    }])

    writer.nudge()

    okay(entries[0], [{
        promise: '1/1', body: 1, previous: null
    }, {
        promise: '1/2', body: 2, previous: null
    }, {
        promise: '2/0', body: 3, previous: null
    }, {
        promise: '2/1', body: 4, previous: null
    }], 'entries')
}
