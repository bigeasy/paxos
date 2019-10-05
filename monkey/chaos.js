const Runner = require('./runner')

let seed
if (process.argv[2]) {
    seed = parseInt(process.argv[2])
} else {
    seed = new Date().valueOf() % 65535
}

const runner = new Runner({
    denizens: 7,
    timeout: 100,
    seed: seed
})

runner.run()
