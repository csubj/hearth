# Upgrading

Upgrade a running hearth instance to a newer version.

## General process

1. **Back up** `data/` — see [Backup & restore](backup-restore.md)
2. **Pull** the new image or build from the target git tag
3. **Restart** the container or process
4. **Verify** migrations ran and the app is healthy

Migrations run automatically when the app starts (dev, `pnpm start`, and Docker). No manual migration step is required for normal upgrades.

## Docker upgrade

### GHCR image

```bash
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

### Local build

```bash
git pull origin main
docker compose up -d --build
```

## Pinning a version

Use a specific image tag instead of `latest`:

```yaml
# docker-compose.ghcr.yml
image: ghcr.io/<owner>/hearth:1.0.0
```

Or a commit SHA:

```yaml
image: ghcr.io/<owner>/hearth:sha-abc1234
```

## Node upgrade (no Docker)

```bash
git pull origin main
pnpm install
pnpm build
pnpm start
```

## Post-upgrade verification

```bash
curl https://your-hearth.example.com/api/health
```

Log in and spot-check:

- Home page loads
- Project quick capture works on `/projects`
- Maintenance list loads at `/maintenance`
- Photos and PDFs still display on project/inventory detail pages

### Upgrading past Stream removal

If your instance still has Stream data, run **before** starting the upgraded app:

```bash
tsx scripts/purge-stream.ts
```

Docker runs both purge scripts automatically on container start (before the server applies migrations).

## Rollback

If something goes wrong:

1. Stop the current container
2. Restore `data/` from pre-upgrade backup if migrations caused issues
3. Start the previous image tag

!!! warning
SQLite migrations are generally forward-only. Test upgrades on a backup copy when jumping multiple versions.

## Release tags

Push a `v*` tag to trigger a semver image publish:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Published tags: `1.0.0`, `1.0` (major.minor), plus `sha-<short-sha>`.
