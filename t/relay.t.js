require('proof')(3, prove)

function prove (okay) {
    var Relay = require('../relay')
    var relay = new Relay('0/0')

    relay.update('1', true, '1/0', true)
    relay.update('2', true, '1/0', true)

    okay(relay.outbox, {
        1: { reachable: true, committed: '1/0', naturalized: true },
        2: { reachable: true, committed: '1/0', naturalized: true }
    }, 'outbox')

    relay.received({ 1: { reachable: true, committed: '0/0', naturalized: true } })

    okay(relay.outbox, {
        1: { reachable: true, committed: '1/0', naturalized: true },
        2: { reachable: true, committed: '1/0', naturalized: true }
    }, 'no change')

    relay.received({
        1: { reachable: true, committed: '1/0', naturalized: true },
        1: { reachable: true, committed: '1/0', naturalized: true }
    })

    okay(relay.outbox, {
        2: { reachable: true, committed: '1/0', naturalized: true }
    }, 'received')
}
