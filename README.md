# hearth

Household coordination — projects, restaurants, metrics, and inventory. One deployment serves one household.

## Features

- **Home dashboard** — stats strip, "since last visit" activity, and upcoming reminders at a glance
- **Projects** — status and priority tracking, components table, markdown notes, links, and tags
- **Restaurants** — status, star ratings, and visited tracking
- **Metrics** — log entries, view history, and visualize trends with charts (Recharts)
- **Inventory** — types, tags, filters, links, CSV import/export, and per-item maintenance reminders
- **Maintenance reminders & reminders feed** — recurring upkeep tasks with a consolidated feed
- **Notifications & @mentions** — in-app notifications with mention support
- **Attachments** — photo and document uploads
- **Browse menu** — quick global navigation across sections
- **Themes** — selectable UI theme in settings
- **Admin** — user management and API token administration
- **REST API** — `/api/v1/*` with OpenAPI spec and Scalar-powered docs (`/api/docs`)
- **Auth modes** — gated login (`required`) or shared household access (`open`) via `AUTH_MODE`

## Design docs

- **[Documentation site](https://csubj.github.io/hearth/)** — user guide, operating guide, architecture (MkDocs)
- **[docs/design/README.md](docs/design/README.md)** — internal design index
- **[AGENTS.md](AGENTS.md)** — contributor and agent guide

## Requirements

- Node.js 22 LTS
- [pnpm](https://pnpm.io) 10.x
- macOS / Linux (SQLite via `better-sqlite3`)

## Local setup

```bash
pnpm install
lefthook install
cp .env.example .env
```

The defaults in `.env.example` work out of the box for local development. Optionally set `AUTH_MODE` (`required` or `open`) and the `HEARTH_BOOTSTRAP_*` credentials before bootstrapping.

Create the first admin (once per instance). Migrations run automatically when the dev or production server starts.

```bash
pnpm run auth:bootstrap
```

Start the dev server:

```bash
pnpm dev
```

Open http://localhost:3000 and sign in with the bootstrap account.

Database and uploads live in `./data/` (gitignored).

## Scripts

| Command                   | Purpose                                |
| ------------------------- | -------------------------------------- |
| `pnpm dev`                | Next.js dev server                     |
| `pnpm build`              | Production build                       |
| `pnpm start`              | Run production server                  |
| `pnpm test`               | Vitest (uses in-memory SQLite)         |
| `pnpm lint`               | ESLint                                 |
| `pnpm format`             | Prettier write                         |
| `pnpm format:check`       | Prettier check                         |
| `pnpm typecheck`          | TypeScript                             |
| `pnpm db:migrate`         | Apply Drizzle migrations manually (optional; app migrates on startup) |
| `pnpm db:generate`        | Generate migration from schema changes |
| `pnpm run auth:bootstrap` | Create first admin user                |
| `pnpm run auth:create-token` | Create a REST API bearer token      |
| `pnpm smoke:docker`       | Docker smoke test (see below)          |

## Docker

Build and run with Docker Compose:

```bash
docker compose up -d --build
docker compose exec app pnpm run auth:bootstrap
```

Or pass bootstrap credentials on first deploy:

```bash
docker compose exec \
  -e HEARTH_BOOTSTRAP_USERNAME=admin \
  -e HEARTH_BOOTSTRAP_PASSWORD='your-secure-password' \
  -e HEARTH_BOOTSTRAP_DISPLAY_NAME='Admin' \
  app pnpm run auth:bootstrap
```

Health check: `GET http://localhost:3000/api/health` → `{ "ok": true }`

### Automated smoke test

```bash
pnpm smoke:docker
```

This script:

1. Builds and starts the stack (`docker compose up --build --wait`)
2. Bootstraps a smoke-test admin (skipped if users already exist)
3. Verifies `/api/health`, authenticated access to `/projects`, and that a project is visible

For a manual end-to-end check in the browser:

1. `docker compose up -d --build`
2. `docker compose exec app pnpm run auth:bootstrap`
3. Open http://localhost:3000 → sign in → add a project from Home or `/projects`

See [docs/design/09_deploy.md](docs/design/09_deploy.md) for backup, HTTPS, and hosting notes.

### Published image (GHCR)

Every push to `main` (and version tags `v*`) publishes a Docker image to [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry):

```bash
docker pull ghcr.io/<owner>/hearth:latest
```

Replace `<owner>` with your GitHub org or username (lowercase).

Run without building locally:

```bash
docker run -d \
  --name hearth \
  -p 3000:3000 \
  -e DATABASE_URL=file:/app/data/hearth.db \
  -e HOSTNAME=0.0.0.0 \
  -v hearth-data:/app/data \
  ghcr.io/<owner>/hearth:latest
```

Or use the compose override:

```bash
# Edit docker-compose.ghcr.yml — set your ghcr.io/<owner>/hearth image
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

Required env var: `DATABASE_URL` (see [.env.example](.env.example)). `SESSION_SECRET` is reserved and currently unused — Lucia uses opaque database session IDs rather than signed cookies. Mount `/app/data` for SQLite (`hearth.db`) and uploads.

Bootstrap the first admin after the container is healthy:

```bash
docker exec hearth pnpm run auth:bootstrap
```

Image tags: `latest` (main), `sha-<short-sha>` (commit), `main` (branch ref), and semver tags when you push `v*` releases.

## CI

GitHub Actions runs lint, format check, typecheck, and tests on push to `main` and on pull requests. See [docs/design/10_ci.md](docs/design/10_ci.md).

## Build phases

Implementation follows [docs/design/08_mvp.md](docs/design/08_mvp.md). The v1 MVP (phases 0–7) is complete.
