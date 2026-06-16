#!/bin/sh
set -e

mkdir -p /app/data/uploads

cd /app
pnpm db:migrate

exec node server.js
