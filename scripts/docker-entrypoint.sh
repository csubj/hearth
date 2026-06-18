#!/bin/sh
set -e

mkdir -p /app/data/uploads

cd /app
tsx scripts/purge-events.ts
pnpm db:migrate

exec node server.js
