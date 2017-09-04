#!/bin/sh

set -e

if [ ! -e node_modules/.bin/istanbul ]; then
    cat << EOF 1>&2

Istanbul is required to run coverage. Install Istanbul:

    npm install istanbul

EOF
    exit 1
fi

rm -rf coverage

count=1;
for file in $(find . ! -path '*/node_modules/*' -name \*.t.js); do
  node_modules/.bin/istanbul cover -x 't/**' -x '*/t/**' $file > /dev/null 2>&1
  mv coverage/coverage.json coverage/coverage$count.json
  count=$(expr $count + 1)
done

node_modules/.bin/istanbul report --root coverage --dir coverage > /dev/null

sed -i -e s,'^SF:'`pwd`/,SF:, coverage/lcov.info

exit 0
