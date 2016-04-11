require('proof')(2, prove)

function prove (assert) {
    var Legislator = require('../../legislator')
    var signal = require('signal')
    var Legislator = require('../../legislator'),
        Network = require('../../synchronous/network'),
        Machine = require('../../synchronous/machine'),
        signal = require('signal')

    signal.subscribe('.bigeasy.paxos.invoke'.split('.'), function (id, method, vargs) {
         if (id == '0') {
            // console.log(JSON.stringify({ method: method, vargs: vargs }))
        }
    })

    var time = 0, gremlin

    var options = {
        Date: { now: function () { return time } },
        parliamentSize: 5,
        ping: 1,
        timeout: 2,
        retry: 5
    }

    signal.subscribe('.bigeasy.paxos.invoke'.split('.'), function (id, method, vargs) {
         if (id == '0') {
            // console.log(JSON.stringify({ method: method, vargs: vargs }))
        }
    })


    ! function () {
        var legislator = new Legislator('1')

        legislator._actualSchedule('scheduled', { type: 'scheduled' }, 0)
        legislator._actualSchedule('removed', { type: 'removed' }, 0)
        legislator._unschedule('removed')

        var wasScheduled = false
        legislator._whenScheduled = function () {
            wasScheduled = true
        }

        legislator._whenRemoved = function () {
            throw new Error
        }

        assert(legislator.checkSchedule(0), 'check schedule')
        assert(wasScheduled, 'scheduled')
    } ()


    var options = {
        Date: { now: function () { return time } },
        parliamentSize: 5,
        ping: 1,
        timeout: 2,
        retry: 5
    }

    var legislators = [ new Legislator('0', options) ]
    legislators[0].bootstrap(time, '0')

    var network = new Network
    var machine = new Machine(network, legislators[0])
    network.machines.push(machine)

    network.tick(time)
}
