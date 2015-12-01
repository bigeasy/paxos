// To generated `events.json`, run the following.
//
// node t/paxos/legislator.t.js | grep '^\['  > events.json
//
var assert = require('assert')
var fs = require('fs')
var entries = fs.readFileSync('events.json', 'utf8').split(/\n/).map(function (line) {
    if (line) return JSON.parse(line)
})
entries.pop()

var slice = [].slice
var recorded = []

var signal = require('signal')

signal.subscribe('.bigeasy.paxos.invoke'.split('.'), function (id, method, vargs) {
    if (id == '0') {
        recorded.push({ method: method, vargs: JSON.parse(JSON.stringify(vargs)) })
    }
})

var Legislator = require('./legislator')
var legislator = new Legislator('0', {
    parliamentSize: 5,
    ping: 1,
    timeout: 2,
    retry: 5,
    recorder: function () {
        recorded.push(JSON.parse(JSON.stringify(slice.call(arguments))))
    }
})

var i = 0
while (i < entries.length) {
    var entry = entries[i], vargs = JSON.parse(JSON.stringify(entry.vargs)), method = entry.method
    if (method == 'prefer odd') {
        legislator.prefer = function (citizen) {
            return (+citizen) % 2
        }
        i++
    } else if (method == 'prefer even') {
        legislator.prefer = function (citizen) {
            return (+citizen) % 2 == 0
        }
        i++
    } else {
        console.log(method, vargs)
        legislator[method].apply(legislator, vargs)
        if (false) recorded.forEach(function (record) {
            console.log('    ' + JSON.stringify(record))
        })
        while (recorded.length) {
            console.log('< ' + JSON.stringify(entries[i]))
            console.log('> ' + JSON.stringify(recorded[0]))
            assert.deepEqual(recorded.shift(), entries[i], 'line ' + i)
            i++
        }
    }
    console.log(i)
}
