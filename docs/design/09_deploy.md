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

| Variable                        | Required  | Default                 | Purpose                                  |
| ------------------------------- | --------- | ----------------------- | ---------------------------------------- |
| `DATABASE_URL`                  | yes       | `file:./data/hearth.db` | SQLite path                              |
| `SESSION_SECRET`                | prod yes  | —                       | Lucia session signing (32+ random bytes) |
| `NODE_ENV`                      | auto      | `development`           |                                          |
| `PORT`                          | no        | `3000`                  | Next.js listen port                      |
| `UPLOADS_DIR`                   | no        | `data/uploads`          | Photo storage root                       |
| `HEARTH_BOOTSTRAP_USERNAME`     | bootstrap | —                       | First admin (non-interactive)            |
| `HEARTH_BOOTSTRAP_PASSWORD`     | bootstrap | —                       |                                          |
| `HEARTH_BOOTSTRAP_DISPLAY_NAME` | no        | —                       |                                          |

Generate session secret:

```bash
openssl rand -base64 32
```

Never commit `.env` — already gitignored.

---

## Local development

```bash
pnpm install
lefthook install
cp .env.example .env
pnpm db:migrate
pnpm run auth:bootstrap   # first time only
pnpm dev
```

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
      SESSION_SECRET: ${SESSION_SECRET}
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

Run migrations on container start via entrypoint script:

```bash
pnpm db:migrate && node server.js
```

---

## Entrypoint script

`scripts/docker-entrypoint.sh`:

1. Ensure `data/` and `data/uploads/` exist
2. `pnpm db:migrate`
3. Exec Next.js start command

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
- Do not skip `SESSION_SECRET` in production

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
    required: [DATABASE_URL, SESSION_SECRET]
    optional: [PORT, UPLOADS_DIR, HEARTH_BOOTSTRAP_*]
```
