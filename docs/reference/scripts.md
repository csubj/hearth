# Scripts reference

Commands for development, database management, quality checks, Docker, and documentation.

## pnpm scripts

Defined in `package.json`:

| Command                   | Purpose                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                | Next.js development server                                            |
| `pnpm build`              | Production build                                                      |
| `pnpm start`              | Run production server                                                 |
| `pnpm test`               | Vitest (single run, in-memory SQLite)                                 |
| `pnpm test:watch`         | Vitest watch mode                                                     |
| `pnpm lint`               | ESLint (`--max-warnings=0`)                                           |
| `pnpm format`             | Prettier write                                                        |
| `pnpm run format:check`   | Prettier check (CI)                                                   |
| `pnpm typecheck`          | TypeScript (`tsc --noEmit`)                                           |
| `pnpm db:migrate`         | Apply Drizzle migrations manually (optional; app migrates on startup) |
| `pnpm db:generate`        | Generate migration from schema changes                                |
| `pnpm run auth:bootstrap` | Create first admin (once per instance)                                |
| `pnpm smoke:docker`       | Docker smoke test                                                     |

## Makefile targets

Run `make help` for the full list:

| Target                | Purpose                               |
| --------------------- | ------------------------------------- |
| `make install`        | `pnpm install`                        |
| `make setup`          | Install deps + lefthook hooks         |
| `make dev`            | Dev server                            |
| `make build`          | Production build                      |
| `make start`          | Production server                     |
| `make test`           | Run tests                             |
| `make lint`           | ESLint                                |
| `make typecheck`      | TypeScript                            |
| `make check`          | Lint + typecheck + test               |
| `make db-migrate`     | Apply migrations                      |
| `make db-generate`    | Generate migration                    |
| `make auth-bootstrap` | First admin CLI                       |
| `make docker-build`   | Build Docker image                    |
| `make docker-up`      | Start with local build                |
| `make docker-up-ghcr` | Start with GHCR image                 |
| `make docker-down`    | Stop containers                       |
| `make docker-logs`    | Tail app logs                         |
| `make smoke`          | Docker smoke test                     |
| `make docs-install`   | Install MkDocs dependencies           |
| `make docs-serve`     | Preview docs at http://127.0.0.1:8000 |
| `make docs-build`     | Build static site to `site/`          |

## auth:bootstrap

Creates the first admin user when no users exist.

**Interactive:**

```bash
pnpm run auth:bootstrap
```

**Non-interactive:**

```bash
HEARTH_BOOTSTRAP_USERNAME=admin \
HEARTH_BOOTSTRAP_PASSWORD='secure-password' \
HEARTH_BOOTSTRAP_DISPLAY_NAME='Admin' \
pnpm run auth:bootstrap
```

**Docker:**

```bash
docker compose exec app pnpm run auth:bootstrap
```

Refuses to run if any user already exists.

## smoke:docker

End-to-end Docker verification:

1. Builds and starts compose stack
2. Bootstraps smoke-test admin
3. Checks `/api/health`
4. Verifies authenticated `/projects` access and a seeded project appears

```bash
pnpm smoke:docker
```

## Data purge scripts (upgrades)

Run before migrations when removing legacy features:

| Script                        | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `tsx scripts/purge-events.ts` | Remove events table data, attachments, mentions, notifications |
| `tsx scripts/purge-stream.ts` | Remove stream entries, attachments, mentions, notifications    |

Docker entrypoint runs both automatically before the server starts (migrations run when the app boots).

## Git hooks (lefthook)

| Hook         | When          | Runs                                         |
| ------------ | ------------- | -------------------------------------------- |
| `pre-commit` | Before commit | Lint, format check, typecheck (staged files) |
| `commit-msg` | After message | Conventional Commits validation              |
| `pre-push`   | Before push   | Full test suite                              |

Install hooks:

```bash
lefthook install
# or: make setup
```

## Documentation

| Command             | Purpose                                |
| ------------------- | -------------------------------------- |
| `make docs-install` | `pip install -r requirements-docs.txt` |
| `make docs-serve`   | Local preview                          |
| `make docs-build`   | Static build to `site/`                |

Published at [https://csubj.github.io/hearth/](https://csubj.github.io/hearth/) via GitHub Actions on push to `main`.

**One-time setup:** In the GitHub repo, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
