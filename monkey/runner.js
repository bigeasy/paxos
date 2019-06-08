const Paxos = require('..')

class Runner {
  constructor(options) {
    this.options = options
    this.time = 0
    this._log = { 0: [] }
    this.checks = []
    this.jobs = []
    this.denizens = new Array(options.denizens)
    for (let i = 0; i < options.denizens; i++) {
      this.denizens[i] = new Paxos(this.time, `denizen_${i}`, {
        parliamentSize: 5,
        ping: 1,
        timeout: 3
      })
      this.denizens[i].shifter = this.denizens[i].outbox.shifter()
    }

    this.leader = this.denizens[0]

    this.schedule({ bootstrap: true, in: 0 })
    this.schedule({ join: 'denizen_1', in: 2 })
    this.schedule({ embark: 'denizen_1', in: 4 })
    // this.schedule({ join: 'denizen_2', in: 6 })
    // this.schedule({ embark: 'denizen_2', in: 8 })
  }

  log(item) {
    this._log[this.time].push(item)
    this.check()
  }

  bootstrap() {
    this.log({ bootstrap: this.leader.id })
    this.leader.bootstrap(
      'republic_1',
      this.time,
      { location: '0' }
    )
  }

  join(denizen) {
    let result = denizen.join('republic_1', this.time)
    this.log({ joined: denizen.id })
    this.addCheck({ arrived: denizen.id })
  }

  embark(denizen) {
    let response = this.leader.embark(
      this.time,
      'republic_1',
      denizen.id,
      denizen.cookie,
      { location: '1' },
      false // acclimated
    )
    this.log({ embarked: denizen.id, ...response })
  }

  send() {
    for (let denizen of this.denizens) {
      denizen.scheduler.check(this.time)
      let communique
      while (communique = denizen.shifter.shift()) {
        if (communique != null) {
          let sender = this.denizen(communique.from)
          for (let envelope of communique.envelopes) {
            const item = {
              from: communique.from,
              to: envelope.to,
              message: envelope.request.message.method,
              synced: envelope.request.sync.synced
            }
            this.log({ envelope: item })
            let recipient = this.denizen(envelope.to)
            if (recipient === null) {
              console.log('null recipient')
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

  run() {
    console.log(`Running chaos monkey with ${this.options.denizens} denizens...`)
    while(true) {
      let shifter = this.leader.log.shifter()

      this.runJobs()

      this.send()

      this.inspect(shifter)

      this.check()

      if (this.options.timeout && this.time >= this.options.timeout) {
        this.log({ timeout: this.options.timeout })
        this.results()
        break
      }

      this.tick()
    }
  }

  runJobs() {
    for (const index in this.jobs) {
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

  inspect(shifter) {
    let entry
    while (entry = shifter.shift()) {
      // console.log('entry.government.arrived', entry.government.arrived)
      if (entry.government.arrived) {
        let arrived = this.denizen(entry.government.arrived.id[entry.government.promise])
        this.log({ arrived: arrived.id })
        arrived.acclimate()
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
    check.timeout = this.time + (check.timeout || 10)
    check.id = `check_${this.checks.length}`
    this.checks.push(check)
  }

  check() {
    for (const check of this.checks) {
      if (check.passed) {
        // console.log(`${check.id} passed, returning`)
        return
      }

      if (check.arrived) {
        for (const item of this._log[this.time]) {
          if (check.arrived === item.arrived) {
            check.passed = true
            // console.log('check passed', { time: this.time }, check)
            this.log({ check: { passed: check.id, arrived: check.arrived } })
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
    for (const check of this.checks) {
      console.log(check)
    }
    console.log('')

    console.log('Government:')
    console.log('')
    console.log(this.leader.government)
  }
}

module.exports = Runner
