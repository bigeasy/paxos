[![Actions Status](https://github.com/bigeasy/paxos/workflows/Node%20CI/badge.svg)](https://github.com/bigeasy/paxos/actions)
[![codecov](https://codecov.io/gh/bigeasy/paxos/branch/master/graph/badge.svg)](https://codecov.io/gh/bigeasy/paxos)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An implementation of multi-Paxos.

| What          | Where                                     |
| --- | --- |
| Discussion    | https://github.com/bigeasy/paxos/issues/1 |
| Documentation | https://bigeasy.github.io/paxos           |
| Source        | https://github.com/bigeasy/paxos          |
| Issues        | https://github.com/bigeasy/paxos/issues   |
| CI            | https://travis-ci.org/bigeasy/paxos       |
| Coverage:     | https://codecov.io/gh/bigeasy/paxos       |
| License:      | MIT                                       |

Paxos installs from NPM.

```
//{ "mode": "text" }
npm install paxos
```

## Living `README.md`

This `README.md` is also a unit test using the
[Proof](https://github.com/bigeasy/proof) unit test framework. We'll use the
Proof `okay` function to assert out statements in the readme. A Proof unit test
generally looks like this.

```javascript
//{ "code": { "tests": 1 }, "text": { "tests": 4  } }
require('proof')(%(tests)d, okay => {
    //{ "include": "test", "mode": "code" }
    //{ "include": "proof" }
})
```

```javascript
//{ "name": "proof", "mode": "text" }
okay('always okay')
okay(true, 'okay if true')
okay(1, 1, 'okay if equal')
okay({ value: 1 }, { value: 1 }, 'okay if deep strict equal')
```

You can run this unit test yourself to see the output from the various
code sections of the readme.

```text
//{ "mode": "text" }
git clone git@github.com:bigeasy/paxos.git
cd paxos
npm install --no-package-lock --no-save
node test/readme.t.js
```

## Overview

```javascript
//{ "name": "test" }
okay('TODO')
```
