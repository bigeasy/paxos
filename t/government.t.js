require('proof')(18, prove)

function prove (okay) {
    var Government = require('../government')
    var government = {
        promise: '1/0',
        majority: [ '0' ],
        minority: [],
        constituents: [],
        naturalized: [ '0' ],
        immigrated: { id: { '1/0': '0' }, promise: { '0': '1/0' } },
        properties: { '0': { location: '0' } }
    }
    var entries = []
    entries.unshift({
        promise: '2/0',
        body: Government.explode(government, {
            majority: [ '0' ],
            minority: [],
            immigrate:  { id: '1', properties: { location: '1' } },
            naturalize: '1'
        })
    })
    okay(entries[0], {
        promise: '2/0',
        body: {
            majority: [ '0' ],
            minority: [],
            immigrate:  { id: '1', properties: { location: '1' } },
            naturalize: '1'
        }
    }, 'expand')
    government = Government.advance(government, entries[0])
    okay(government, {
        promise: '2/0',
        majority: [ '0' ],
        minority: [],
        constituents: [ '1' ],
        naturalized: [ '0', '1' ],
        immigrated: { id: { '1/0': '0', '2/0': '1' }, promise: { '0': '1/0', '1': '2/0' } },
        properties: { '0': { location: '0' }, '1': { location: '1' } }
    }, 'immigrate')
    entries.unshift({
        promise: '3/0',
        body: Government.explode(government, {
            majority: [ '0' ],
            minority: [],
            immigrate:  { id: '2', properties: { location: '2' } }
        })
    })
    government = Government.advance(government, entries[0])
    entries.unshift({
        promise: '4/0',
        body: Government.explode(government, {
            majority: [ '0' ],
            minority: [],
            naturalize: '2'
        })
    })
    government = Government.advance(government, entries[0])
    okay(government, {
        promise: '4/0',
        majority: [ '0' ],
        minority: [],
        constituents: [ '1', '2' ],
        naturalized: [ '0', '1', '2' ],
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0' }
        },
        properties: { '0': { location: '0' }, '1': { location: '1' }, '2': { location: '2' } }
    }, 'separate migrate and naturalize')
    entries.unshift({
        promise: '5/0',
        body: Government.explode(government, {
            majority: [ '0', '1' ],
            minority: [ '2' ],
            promote: [ '1', '2' ]
        })
    })
    okay(entries[0], {
        promise: '5/0',
        body: {
            majority: [ '0', '1' ],
            minority: [ '2' ],
            promote: [{ id: '2', index: 1 }, { id: '1', index: 0 }]
        }
    }, 'promote entry')
    government = Government.advance(government, entries[0])
    okay(government, {
        promise: '5/0',
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [],
        naturalized: [ '0', '1', '2' ],
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0' }
        },
        properties: { '0': { location: '0' }, '1': { location: '1' }, '2': { location: '2' } }
    }, 'promote')
    entries.unshift({
        promise: '6/0',
        body: Government.explode(government, {
            majority: [ '0', '1' ],
            minority: [ '2' ],
            immigrate:  { id: '3', properties: { location: '3' } }
        })
    })
    government = Government.advance(government, entries[0])
    entries.unshift({
        promise: '7/0',
        body: Government.explode(government, {
            majority: [ '0', '1' ],
            minority: [ '2' ],
            exile: '3'
        })
    })
    okay(entries[0], {
        promise: '7/0',
        body: {
            majority: [ '0', '1' ],
            minority: [ '2' ],
            exile: {
                id: '3',
                promise: '6/0',
                properties: { location: '3' },
                index: { constituents: 0 }
            }
        }
    }, 'exile unnaturalized constituent')
    government = Government.advance(government, entries[0])
    okay(government, {
        promise: '7/0',
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [],
        naturalized: [ '0', '1', '2' ],
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0' }
        },
        properties: { '0': { location: '0' }, '1': { location: '1' }, '2': { location: '2' } }
    }, 'exile unnaturalized constituent')
    entries.unshift({
        promise: '8/0',
        body: Government.explode(government, {
            majority: [ '0', '1' ],
            minority: [],
            exile: '2'
        })
    })
    okay(entries[0], {
        promise: '8/0',
        body: {
            majority: [ '0', '1' ],
            minority: [],
            exile: {
                id: '2',
                promise: '3/0',
                properties: { location: '2' },
                index: { naturalized: 2 }
            }
        }
    }, 'exile minority member entry')
    government = Government.advance(government, entries[0])
    okay(government, {
        promise: '8/0',
        majority: [ '0', '1' ],
        minority: [],
        constituents: [],
        naturalized: [ '0', '1' ],
        immigrated: {
            id: { '1/0': '0', '2/0': '1' },
            promise: { '0': '1/0', '1': '2/0' }
        },
        properties: { '0': { location: '0' }, '1': { location: '1' } }
    }, 'exile miniority member')
    entries.unshift({
        promise: '9/0',
        body: Government.explode(government, {
            majority: [ '0' ],
            minority: [],
            demote: '1'
        })
    })
    okay(entries[0], {
        promise: '9/0',
        body: {
            majority: [ '0' ],
            minority: [],
            demote: '1'
        }
    }, 'demote entry')
    government = Government.advance(government, entries[0])
    okay(government, {
        promise: '9/0',
        majority: [ '0' ],
        minority: [],
        constituents: [ '1' ],
        naturalized: [ '0', '1' ],
        immigrated: {
            id: { '1/0': '0', '2/0': '1' },
            promise: { '0': '1/0', '1': '2/0' }
        },
        properties: { '0': { location: '0' }, '1': { location: '1' } }
    }, 'demote')
    government = Government.retreat(government, entries.shift(), entries[0])
    okay(government, {
        promise: '8/0',
        majority: [ '0', '1' ],
        minority: [],
        constituents: [],
        naturalized: [ '0', '1' ],
        immigrated: {
            id: { '1/0': '0', '2/0': '1' },
            promise: { '0': '1/0', '1': '2/0' }
        },
        properties: { '0': { location: '0' }, '1': { location: '1' } }
    }, 'retreat demote')
    government = Government.retreat(government, entries.shift(), entries[0])
    okay(government, {
        promise: '7/0',
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [],
        naturalized: [ '0', '1', '2' ],
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0' }
        },
        properties: { '0': { location: '0' }, '1': { location: '1' }, '2': { location: '2' } }
    }, 'retreat exile miniory member')
    government = Government.retreat(government, entries.shift(), entries[0])
    okay(government, {
        promise: '6/0',
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [ '3' ],
        naturalized: [ '0', '1', '2' ],
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2', '6/0': '3' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0', '3': '6/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' },
            '3': { location: '3' }
        }
    }, 'retreat exile unnaturalized constituent')
    government = Government.retreat(government, entries.shift(), entries[0])
    okay(government, {
        promise: '5/0',
        majority: [ '0', '1' ],
        minority: [ '2' ],
        constituents: [],
        naturalized: [ '0', '1', '2' ],
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0' }
        },
        properties: {
            '0': { location: '0' },
            '1': { location: '1' },
            '2': { location: '2' }
        }
    }, 'retreat unnaturalized immigrate')
    government = Government.retreat(government, entries.shift(), entries[0])
    okay(government, {
        promise: '4/0',
        majority: [ '0' ],
        minority: [],
        constituents: [ '1', '2' ],
        naturalized: [ '0', '1', '2' ],
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0' }
        },
        properties: { '0': { location: '0' }, '1': { location: '1' }, '2': { location: '2' } }
    }, 'retreat promote')
    government = Government.retreat(government, entries.shift(), entries[0])
    okay(government, {
        promise: '3/0',
        majority: [ '0' ],
        minority: [],
        constituents: [ '1', '2' ],
        naturalized: [ '0', '1' ],
        immigrated: {
            id: { '1/0': '0', '2/0': '1', '3/0': '2' },
            promise: { '0': '1/0', '1': '2/0', '2': '3/0' }
        },
        properties: { '0': { location: '0' }, '1': { location: '1' }, '2': { location: '2' } }
    }, 'retreat naturalize')
    government = Government.retreat(government, entries.shift(), entries[0])
    okay(government, {
        promise: '2/0',
        majority: [ '0' ],
        minority: [],
        constituents: [ '1' ],
        naturalized: [ '0', '1' ],
        immigrated: {
            id: { '1/0': '0', '2/0': '1' },
            promise: { '0': '1/0', '1': '2/0' }
        },
        properties: { '0': { location: '0' }, '1': { location: '1' } }
    }, 'retreat immigrate')
}
