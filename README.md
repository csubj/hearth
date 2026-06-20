# hearth

[![CI](https://github.com/csubj/hearth/actions/workflows/ci.yml/badge.svg)](https://github.com/csubj/hearth/actions/workflows/ci.yml)
[![Docs](https://github.com/csubj/hearth/actions/workflows/docs.yml/badge.svg)](https://github.com/csubj/hearth/actions/workflows/docs.yml)
[![Publish image](https://github.com/csubj/hearth/actions/workflows/publish-image.yml/badge.svg)](https://github.com/csubj/hearth/actions/workflows/publish-image.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-22%20LTS-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.x-f69220.svg)](https://pnpm.io/)

Household coordination — projects, restaurants, metrics, inventory, and maintenance. One deployment serves one household.

**Documentation:** [csubj.github.io/hearth](https://csubj.github.io/hearth/) · **API docs:** `/api/docs` (when running)

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [Documentation](#documentation)
- [Tech stack](#tech-stack)
- [Development](#development)
- [Docker](#docker)
- [CI](#ci)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Home dashboard** — stats strip, "since last visit" activity, and upcoming reminders at a glance
- **Projects** — status and priority tracking, components table, markdown notes, links, and tags
- **Restaurants** — status, star ratings, and visited tracking
- **Metrics** — log entries, view history, and visualize trends with charts (Recharts)
- **Inventory** — types, tags, filters, links, CSV import/export, and per-item upkeep reminders
- **House maintenance** — log work with metadata (company, cost, dates), follow-up reminders, tags, links, and related projects/inventory
- **Reminders feed** — consolidated upcoming feed for maintenance follow-ups, item upkeep, and metric logging
- **Notifications & @mentions** — in-app notifications with mention support
- **Attachments** — photo and document uploads
- **Browse menu** — quick global navigation across sections
- **Themes** — selectable UI theme in settings
- **Admin** — user management and API token administration
- **REST API** — `/api/v1/*` with OpenAPI spec and Scalar-powered docs (`/api/docs`)
- **Auth modes** — gated login (`required`) or shared household access (`open`) via `AUTH_MODE`

## Quick start

**Requirements:** Node.js 22 LTS, [pnpm](https://pnpm.io) 10.x, macOS or Linux (SQLite via `better-sqlite3`).

```bash
git clone https://github.com/csubj/hearth.git
cd hearth
pnpm install
lefthook install
cp .env.example .env
pnpm run auth:bootstrap   # once per instance; migrations run on startup
pnpm dev
```

Open http://localhost:3000 and sign in with the bootstrap account. Database and uploads live in `./data/` (gitignored).

The defaults in `.env.example` work out of the box. Optionally set `AUTH_MODE` (`required` or `open`) and the `HEARTH_BOOTSTRAP_*` credentials before bootstrapping.

## Documentation

| Resource                                              | Description                                   |
| ----------------------------------------------------- | --------------------------------------------- |
| [Documentation site](https://csubj.github.io/hearth/) | User guide, operations, architecture (MkDocs) |
| [docs/design/README.md](docs/design/README.md)        | Internal design index                         |
| [docs/contributing.md](docs/contributing.md)          | Contributor guide                             |
| [AGENTS.md](AGENTS.md)                                | AI agent and contributor conventions          |
| [docs/design/08_mvp.md](docs/design/08_mvp.md)        | Build phases (v1 MVP complete)                |
| [docs/design/09_deploy.md](docs/design/09_deploy.md)  | Backup, HTTPS, and hosting                    |
| [docs/design/10_ci.md](docs/design/10_ci.md)          | CI pipeline details                           |

## Tech stack

| Layer     | Choice                             |
| --------- | ---------------------------------- |
| Framework | Next.js 15 (App Router) + React 19 |
| Language  | TypeScript                         |
| Database  | SQLite + Drizzle ORM               |
| Auth      | Lucia v3 + Argon2id                |
| Styling   | Tailwind CSS v4 + Radix UI         |
| Testing   | Vitest                             |
| Docs      | MkDocs Material → GitHub Pages     |

See [docs/design/01_tech.md](docs/design/01_tech.md) for full rationale and conventions.

## Development

### Scripts

| Command                      | Purpose                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                   | Next.js dev server                                                    |
| `pnpm build`                 | Production build                                                      |
| `pnpm start`                 | Run production server                                                 |
| `pnpm test`                  | Vitest (in-memory SQLite)                                             |
| `pnpm lint`                  | ESLint                                                                |
| `pnpm format`                | Prettier write                                                        |
| `pnpm format:check`          | Prettier check                                                        |
| `pnpm typecheck`             | TypeScript                                                            |
| `pnpm db:migrate`            | Apply Drizzle migrations manually (optional; app migrates on startup) |
| `pnpm db:generate`           | Generate migration from schema changes                                |
| `pnpm run auth:bootstrap`    | Create first admin user                                               |
| `pnpm run auth:create-token` | Create a REST API bearer token                                        |
| `pnpm smoke:docker`          | Docker smoke test                                                     |

### Make targets

Run `make help` for the full list. Common shortcuts:

```bash
make setup    # pnpm install + lefthook
make check    # lint + typecheck + test
make smoke    # docker smoke test
make docs-serve   # preview docs at http://127.0.0.1:8000
```

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

### Published image (GHCR)

Every push to `main` (and version tags `v*`) publishes a Docker image to [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry):

```bash
docker pull ghcr.io/csubj/hearth:latest
```

Run without building locally:

```bash
docker run -d \
  --name hearth \
  -p 3000:3000 \
  -e DATABASE_URL=file:/app/data/hearth.db \
  -e HOSTNAME=0.0.0.0 \
  -v hearth-data:/app/data \
  ghcr.io/csubj/hearth:latest
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

GitHub Actions runs lint, format check, typecheck, tests, and production build on push to `main` and on pull requests. Docs deploy to GitHub Pages on changes under `docs/`. Container images publish after CI passes on `main` and `v*` tags.

See [docs/design/10_ci.md](docs/design/10_ci.md) for workflow details.

## Contributing

Contributions are welcome. Read [docs/contributing.md](docs/contributing.md) for setup, conventions, and commit message format (Conventional Commits, enforced by lefthook).

Implementation follows [docs/design/08_mvp.md](docs/design/08_mvp.md). The v1 MVP (phases 0–7) is complete.

## License

[MIT](LICENSE) © Cj Buresch
