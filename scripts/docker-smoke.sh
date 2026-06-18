#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SMOKE_USERNAME="${HEARTH_BOOTSTRAP_USERNAME:-smokeadmin}"
SMOKE_PASSWORD="${HEARTH_BOOTSTRAP_PASSWORD:-smokepass12345}"
SMOKE_DISPLAY_NAME="${HEARTH_BOOTSTRAP_DISPLAY_NAME:-Smoke Test}"

echo "==> Building and starting Docker stack"
docker compose up -d --build --wait

echo "==> Bootstrapping admin user (skipped if users already exist)"
docker compose exec -T \
  -e HEARTH_BOOTSTRAP_USERNAME="$SMOKE_USERNAME" \
  -e HEARTH_BOOTSTRAP_PASSWORD="$SMOKE_PASSWORD" \
  -e HEARTH_BOOTSTRAP_DISPLAY_NAME="$SMOKE_DISPLAY_NAME" \
  app pnpm run auth:bootstrap || echo "Bootstrap skipped — users may already exist."

echo "==> Running in-container verification"
docker compose exec -T \
  -e HEARTH_BOOTSTRAP_USERNAME="$SMOKE_USERNAME" \
  app ./node_modules/.bin/tsx scripts/smoke-verify.ts

echo "==> Smoke test passed"
