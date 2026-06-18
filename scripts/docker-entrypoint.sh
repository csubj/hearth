#!/bin/sh
set -e

mkdir -p /app/data/uploads

cd /app
./node_modules/.bin/tsx scripts/purge-events.ts
./node_modules/.bin/tsx scripts/purge-stream.ts

exec node server.js
