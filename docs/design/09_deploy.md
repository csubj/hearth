---
doc: deploy
project: hearth
version: 1
status: decided
last_updated: 2026-06-15
related:
  - docs/design/01_tech.md
  - docs/design/02_auth.md
  - docs/design/07_attachments.md
---

# Deployment & Runtime

Structured reference for agents and contributors. How to run hearth locally, in Docker, and on a single VPS-style host.

**Model:** one process, one household, one `data/` directory (SQLite + uploads). No horizontal scaling in v1.

---

## Hosting target

| Field           | Value                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Choice**      | Single VPS or PaaS container (Fly.io, Railway, Hetzner, etc.)                                                          |
| **Role**        | Run one Next.js Node server per household instance                                                                     |
| **Rationale**   | Matches embedded SQLite — one writer, local disk for DB and photos. Simplest ops for a personal/household app.         |
| **Conventions** | One deployment = one household. Scale vertically if needed; do not run multiple app instances against one SQLite file. |
| **References**  | Provider docs when chosen; this doc is provider-agnostic                                                               |

---

## Environment variables

Document all in `.env.example`:

| Variable                        | Required  | Default                 | Purpose                                |
| ------------------------------- | --------- | ----------------------- | -------------------------------------- |
| `DATABASE_URL`                  | yes       | `file:./data/hearth.db` | SQLite path                            |
| `AUTH_MODE`                     | no        | `required`              | Web access: `required` \| `open`       |
| `OPEN_MODE_USERNAME`            | when open | —                       | Shared identity username for open mode |
| `SESSION_SECRET`                | no        | —                       | Reserved / unused (not read by Lucia)  |
| `NODE_ENV`                      | auto      | `development`           |                                        |
| `PORT`                          | no        | `3000`                  | Next.js listen port                    |
| `UPLOADS_DIR`                   | no        | `data/uploads`          | Photo and document storage root        |
| `HEARTH_BOOTSTRAP_USERNAME`     | bootstrap | —                       | First admin (non-interactive)          |
| `HEARTH_BOOTSTRAP_PASSWORD`     | bootstrap | —                       |                                        |
| `HEARTH_BOOTSTRAP_DISPLAY_NAME` | no        | —                       |                                        |

`SESSION_SECRET` may appear in older examples but is not used — Lucia stores opaque session IDs in SQLite.

### Auth modes

| `AUTH_MODE`          | Behavior                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `required` (default) | All app pages require login; each write attributed to the logged-in user                                                                                                             |
| `open`               | App pages skip login gate; writes attributed to `OPEN_MODE_USERNAME` user. Admin routes still require a logged-in admin. REST API always requires a bearer token regardless of mode. |

`OPEN_MODE_USERNAME` must match an existing, active user. Create that user during bootstrap or via admin before enabling open mode.

### API tokens

Tokens are managed via `/admin/api-tokens` or `pnpm run auth:create-token`. They are stored hashed in `api_tokens` — not in env vars. Document token handling for operators: create, copy once, revoke when compromised.

### Inventory import/export

Bulk inventory operations use `POST /api/inventory/import` and `GET /api/inventory/export`. Import accepts JSON (same shape as export). File attachments are not inlined — back up `data/uploads/` separately for full restore.

Never commit `.env` — already gitignored.

---

## Local development

```bash
pnpm install
lefthook install
cp .env.example .env
pnpm run auth:bootstrap   # first time only
pnpm dev
```

Migrations run automatically when the dev server starts.

App: http://localhost:3000

Database and uploads live in `./data/` (gitignored).

---

## Docker

### Dockerfile (multi-stage)

1. **deps** — install with pnpm
2. **build** — `pnpm build`
3. **runner** — Node slim, copy `.next/standalone` if enabled, or full `node_modules` + `.next`

Enable Next.js standalone output in `next.config.ts` for smaller images:

```typescript
output: "standalone";
```

### docker-compose.yml

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: file:/app/data/hearth.db
      NODE_ENV: production
    volumes:
      - hearth-data:/app/data
    restart: unless-stopped

volumes:
  hearth-data:
```

**Volume:** mount `hearth-data` at `/app/data` — holds both `hearth.db` and `uploads/`.

### First deploy in Docker

```bash
docker compose up -d --build
docker compose exec app pnpm run auth:bootstrap
# or pass HEARTH_BOOTSTRAP_* env vars on first run
```

Migrations run automatically when the server starts (via Next.js instrumentation). The Docker entrypoint runs legacy purge scripts, then starts the server:

```bash
node server.js
```

---

## Entrypoint script

`scripts/docker-entrypoint.sh`:

1. Ensure `data/` and `data/uploads/` exist
2. Run legacy purge scripts (events, stream) when applicable
3. Exec Next.js start command (migrations run on server startup)

Migrations must be idempotent and committed in `drizzle/`.

---

## Container registry (GHCR)

Workflow: `.github/workflows/publish-image.yml`

| Trigger        | Tags pushed                                               |
| -------------- | --------------------------------------------------------- |
| Push to `main` | `latest`, `sha-<short-sha>`, `main`                       |
| Tag `v*`       | semver (`v1.2.3` → `1.2.3`, `1.2`) plus `sha-<short-sha>` |

Image: `ghcr.io/<owner>/hearth` (lowercased `${{ github.repository }}`).

Pull and run:

```bash
docker pull ghcr.io/<owner>/hearth:latest
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

Edit `docker-compose.ghcr.yml` with your owner slug. Persist `/app/data` (volume `hearth-data`).

**Repo settings:** package visibility defaults to private for org repos; set the `hearth` package to public if you want anonymous pulls, or authenticate with `docker login ghcr.io` using a PAT with `read:packages`.

---

## Health checks

| Probe     | Endpoint                                                |
| --------- | ------------------------------------------------------- |
| Liveness  | `GET /api/health` → `200 { "ok": true }`                |
| Readiness | same — DB connectivity optional check in health handler |

Docker Compose / Fly / Railway health check → `/api/health`.

---

## Backup & restore

**Backup:**

```bash
# stop app or use sqlite3 .backup for hot backup
tar czf hearth-backup-$(date +%Y%m%d).tar.gz data/
```

**Restore:**

```bash
docker compose down
tar xzf hearth-backup-YYYYMMDD.tar.gz
docker compose up -d
```

Includes DB and all uploaded photos.

---

## HTTPS

Terminate TLS at reverse proxy (Caddy, nginx, Traefik) or platform edge (Fly, Railway).

Set cookie `Secure` in production (`NODE_ENV=production`).

Example Caddy in front of compose:

```
hearth.example.com {
  reverse_proxy app:3000
}
```

---

## Resource guidance

| Scale                 | Suggestion                                    |
| --------------------- | --------------------------------------------- |
| Household (2–6 users) | 512 MB–1 GB RAM, 1 vCPU                       |
| Disk                  | Grow `data/` with photos; monitor volume size |

SQLite handles this workload easily.

---

## What not to do

- Do not mount SQLite over NFS/network filesystem
- Do not run multiple replicas writing one DB file
- Do not store uploads outside the persisted volume

---

## Deploy summary (machine-readable)

```yaml
deploy:
  topology: single_instance
  database: sqlite_file_in_data_dir
  uploads: data/uploads
  volume: data/
  port: 3000
  health: /api/health
  bootstrap: pnpm run auth:bootstrap
  migrate_on_start: true
  https: reverse_proxy_or_platform
  scaling: vertical_only
  env:
    required: [DATABASE_URL]
    optional: [PORT, UPLOADS_DIR, AUTH_MODE, OPEN_MODE_USERNAME, HEARTH_BOOTSTRAP_*]
    reserved_unused: [SESSION_SECRET]
  api_tokens: admin_ui_and_cli # not env vars
  inventory_bulk: [/api/inventory/import, /api/inventory/export]
```
