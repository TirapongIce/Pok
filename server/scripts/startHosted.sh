#!/bin/sh
set -eu
node scripts/initDatabase.js
exec node src/index.js
