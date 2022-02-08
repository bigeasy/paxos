const Paxos = require('..')
const seedrandom = require('seedrandom')

class Runner {
    constructor(options) {
        this.options = options
        this.time = 0
        this._log = { 0: [] }
        this.checks = []
        this.jobs = []
        this.denizens = new Array(options.denizens)
        this.acclimated = []
        this.arrived = []
        this.embarked = []

        seedrandom(options.seed, { global: true })

        for (let i = 0; i < options.denizens; i++) {
            const denizen = new Paxos(this.time, `denizen_${i}`, {
                parliamentSize: 5,
                ping: 1,
                timeout: 3
            })
            denizen.scheduler.on('data', (event) => denizen.event(event))
            denizen.shifter = denizen.outbox.shifter().sync
            this.denizens[i] = denizen
        }

        this.leader = this.denizens[0]

        this.schedule({ bootstrap: true, in: 0 })
    }

    log(item) {
        this._log[this.time].push(item)
        try {
            this.check()
        } catch(e) {
            this._log[this.time].push({ timeout: e.message })
            this.results()
            process.exit()
        }
    }

    bootstrap() {
        this.log({ bootstrap: this.leader.id })
        this.leader.bootstrap(
            'republic_1',
            this.time,
            { location: '0' }
        )
        this.leader.joined = true
    }

    join(denizen) {
        let result = denizen.join('republic_1', this.time)
        this.log({ joined: denizen.id, government: denizen.government.promise })
        this.addCheck({ arrived: denizen.id })
        this.addCheck({ acclimated: denizen.id })
        // this.addCheck({ embarked: denizen.id, timeout: 50 })
        denizen.joined = true
    }

    embark(denizen) {
        this.log({ embarked_array: this.embarked })
        if (~this.embarked.indexOf(denizen.id)) {
            this.log({ already_embarked: denizen.id })
            return
        }
        if (false) {
            this.log({ chaos: 'monkey', ates: { embark: denizen.id } })
        } else {
            let response = this.leader.embark(
                this.time,
                'republic_1',
                denizen.id,
                denizen.cookie,
                { location: '1' },
                false // acclimated
            )
            this.log({ embarking: denizen.id, government: this.leader.government.promise, ...response })
        }
        this.schedule({ embark: denizen.id, in: 2 })
    }

    acclimate(denizen) {
        denizen.acclimate()
        const promise = denizen.government.arrived.promise[denizen.id] || null
        this.log({ acclimating: denizen.id, promise: promise, government: denizen.government.promise })
    }

    send() {
        let sent = true
        while (sent) {
            sent = false
            for (let denizen of this.denizens) {
                denizen.scheduler.check(this.time)
                let communique
                while (communique = denizen.shifter.shift()) {
                    if (communique != null) {
                        sent = true
                        let sender = this.denizen(communique.from)
                        for (let envelope of communique.envelopes) {
                            const item = {
                                from: communique.from,
                                to: envelope.to,
                                message: envelope.request.message.method,
                                synced: envelope.request.sync.synced
                            }
                            if (item.message === 'synchronize') {
                                if (!~this.embarked.indexOf(denizen.id)) {
                                    this.log({ embarked: denizen.id })
                                    this.embarked.push(denizen.id)
                                }
                            } else {
                                this.log({ envelope: item })
                            }
                            let recipient = this.denizen(envelope.to)
                            if (this.rollDie(20) || recipient === null) {
                                this.log({ chaos: 'monkey', ates: item })
                                envelope.responses[envelope.to] = null
                            } else {
                                envelope.responses[envelope.to] = recipient.request(this.time, JSON.parse(JSON.stringify(envelope.request)))
                            }
                        }
                        sender.response(this.time, communique.cookie, communique.responses)
                    }
                }
            }
        }
    }

    run() {
        console.log(`Running chaos monkey with ${this.options.denizens} denizens...`)
        console.log(`Random number seed: ${this.options.seed}`)
        while(true) {
            let shifters = this.denizens.map((denizen) => denizen.log.shifter().sync)

            this.runJobs()

            if (this.time % 5 === 0) {
                const denizen = this.denizens.find(denizen => !denizen.joined)
                if (denizen) {
                    this.join(denizen)
                    this.schedule({ embark: denizen.id, in: 2 })
                }
            }

            this.send()

            this.denizens.forEach((denizen, index) => this.inspect(shifters[index], denizen))

            try {
                this.check()
            } catch(e) {
                this._log[this.time].push({ timeout: e.message })
                this.results()
                process.exit()
            }

            if (this.options.timeout && this.time >= this.options.timeout) {
                this.log({ timeout: this.options.timeout })
                this.results()
                break
            }

            this.tick()
        }
    }

    runJobs() {
        for (let index = this.jobs.length - 1; index >= 0; index--) {
            const job = this.jobs[index]
            if (this.time >= job.at) {
                this.jobs.splice(index, 1)
                this.runJob(job)
            }
        }
    }

    schedule(job) {
        job.at = this.time + (job.in === undefined ? 1 : job.in)
        this.jobs.push(job)
    }

    runJob(job) {
        if (job.embark) {
            const denizen = this.denizen(job.embark)
            this.embark(denizen)
        } else if (job.join) {
            const denizen = this.denizen(job.join)
            this.join(denizen)
        } else if (job.bootstrap) {
            this.bootstrap()
        }
    }

    inspect(shifter, denizen) {
        let entry
        while (entry = shifter.shift()) {
            if (denizen.id === entry.government.arrived.id[entry.government.promise]) {
                this.log({ denizen: denizen.id, label: 'entry.government.arrived', arrived: entry.government.arrived })
                let arrived = this.denizen(entry.government.arrived.id[entry.government.promise])
                if (arrived) {
                    this.log({ arrived: arrived.id, government: arrived.government.promise })
                    this.acclimate(arrived)
                }
                this.arrived = Object.keys(entry.government.arrived.promise)
            }

            if (entry.government.acclimated) {
                const newlyAcclimated = entry.government.acclimated.filter(function(id) {
                    const acclimated = this.denizen(id)
                    if (!~this.acclimated.indexOf(acclimated.id)) {
                        this.log({ acclimated: acclimated.id, government: acclimated.government.promise })
                    }
                }, this)
                this.acclimated = entry.government.acclimated
            }
        }
    }

    tick() {
        this.time++
        this._log[this.time] = []
    }

    denizen(id) {
        return this.denizens.find(denizen => denizen.id === id)
    }

    addCheck(check) {
        check.passed = false
        check.timeout = this.time + (check.timeout || 15)
        check.id = `check_${this.checks.length}`
        this.checks.push(check)
        this.log({ _check: check })
    }

    check() {
        for (const check of this.checks) {
            if (check.passed) {
                continue
            }

            if (check.arrived) {
                for (const item of this._log[this.time]) {
                    if (check.arrived === item.arrived) {
                        check.passed = true
                        this.log({ check: { passed: check.id, arrived: check.arrived } })
                    }
                }
            }

            if (check.acclimated) {
                for (const item of this._log[this.time]) {
                    if (check.acclimated === item.acclimated) {
                        check.passed = true
                        this.log({ check: { passed: check.id, acclimated: check.acclimated } })
                    }
                }
            }

            if (check.embarked) {
                for (const item of this._log[this.time]) {
                    if (check.embarked === item.embarked) {
                        check.passed = true
                        this.log({ check: { passed: check.id, embarked: check.embarked } })
                    }
                }
            }

            if (check.timeout <= this.time) {
                console.log(`${check.id} timed out`)
                throw new Error(`${check.id} timed out`)
            }

            // console.log(`nothing to do for ${check.id}`)
        }
    }

    results() {
        console.log('')
        console.log('Results:')
        console.log('')

        for (const time in this._log) {
            if (this._log[time].length) {
                console.log(`Tick ${time}:`)
                for (const item of this._log[time]) {
                    console.log(JSON.stringify(item))
                }
                console.log('')
            }
        }

        console.log('Checks:')
        console.log('')
        let pass = true
        for (const check of this.checks) {
            pass = pass && check.passed
            console.log(JSON.stringify(check))
        }
        console.log('')

        console.log('Government:')
        console.log('')
        console.log('Pass: ' + pass)
    }

    random(max) {
        return Math.floor(Math.random() * max)
    }

    rollDie(odds) {
        const rand = Math.random()
        const threshold = (1 - (1 / odds))
        return rand >= threshold
    }
}

module.exports = Runner
