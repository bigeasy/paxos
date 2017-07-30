require('proof')(1, prove)

function prove (okay) {
    var Log = require('../log')
    var log = new Log({
        enact: function (entry) {
            okay(entry, { body: 1 }, 'enact')
        }
    })
    log.write({ body: 1, previous: null })
    log.commit()
}
