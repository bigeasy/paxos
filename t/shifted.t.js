require('proof')(17, prove)

function prove (okay) {
    var Paxos = require('..'), denizen

    var Network = require('./network')
    var network = new Network

    function dump (value) {
        console.log(require('util').inspect(value, { depth: null }))
    }

    network.bootstrap()

    dump(network.denizens[0].government)
    network.populate(7)

    network.send()

    for (var i = 0; i < 256; i++) {
        network.denizens[0].enqueue(network.time, 1, i)
    }

    network.send('0', '1', '2')

    var sync =  network.send('3', { sync: { to: '7' } })

    network.time += 1

    network.send('1', [ '3' ])

    network.time += 1

    network.send('0')

    network.time += 3

    network.send('1', [ '3' ])

    network.send('0', '1', '2')

    dump(network.denizens[7].log.head.body)

    //dump(sync)

    dump(network.denizens[2].government)

    network.send('5', { sync: { to: '7' } }).sync.forEach(receive)
    network.send('5', { sync: { to: '7' } }).sync.forEach(receive)
    return

    network.time += 1

    network.send('4', '5')
    network.send('1', '2')
    network.send('0')

    console.log(network.denizens[5]._minimum)
    return

    network.request(sync.sync[0])

    dump(sync)


    function receive (envelope) {
        network.request(envelope)
        network.response(envelope)
    }
}
