// `splice` causes `for..in` to exit early.
const a = [ 1, 2, 3, 4, 5 ]

for (const index in a) {
    console.log(index)
    if (index == 3) {
        a.splice(index, 1)
    }
}
// Additionally...
// https://stackoverflow.com/questions/500504/why-is-using-for-in-with-array-iteration-a-bad-idea
