require('proof')(1, prove)

function prove (okay) {
    var Denizen = require('../redux')

    var options = {
        parliamentSize: 5,
        ping: 1,
        timeout: 3,
        naturalized: true,
        shifter: true
    }

    function createDenizen (id) {
        var denizen = new Denizen(id, options)
        denizen.shifter = denizen.outbox.shifter()
        return denizen
    }

    var denizens = [ createDenizen('0') ]

    denizens[0].bootstrap(0, 0, { a: 1 })

    okay(denizens[0].republic, 0, 'bootstrap')
}
