require('proof')(3, prove)

function prove (okay) {
    var Relay = require('../relay')
    var relay = new Relay('0/0')

    relay.update('1', true, '1/0')
    relay.update('2', true, '1/0')

    okay(relay.outbox, {
        1: { reachable: true, committed: '1/0' },
        2: { reachable: true, committed: '1/0' }
    }, 'outbox')

    relay.received({ 1: { reachable: true, committed: '0/0' } })

    okay(relay.outbox, {
        1: { reachable: true, committed: '1/0' },
        2: { reachable: true, committed: '1/0' }
    }, 'no change')

    relay.received({
        1: { reachable: true, committed: '1/0' },
        1: { reachable: true, committed: '1/0' }
    })

    okay(relay.outbox, {
        2: { reachable: true, committed: '1/0' }
    }, 'received')
}
