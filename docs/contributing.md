# Contributing

Thank you for contributing to hearth! This guide covers development setup, conventions, and where to find design context.

## What this is

**hearth** is a household coordination web app — projects, restaurants, metrics, inventory, and maintenance. One instance = one household.

## Before you code

1. Read the [Architecture overview](architecture/index.md) and [Product Vision](design/00_init.md)
2. Check [MVP Phases](design/08_mvp.md) for build status — phases 0–10 are complete
3. Follow stack decisions in [Tech Choices](design/01_tech.md) — do not swap libraries without discussion

## Development setup

```bash
git clone https://github.com/csubj/hearth.git
cd hearth
pnpm install
lefthook install
cp .env.example .env
pnpm db:migrate
pnpm run auth:bootstrap
pnpm dev
```

See [Installation](getting-started/installation.md) for details.

## Commands

```bash
pnpm dev              # local dev server
pnpm test             # vitest
pnpm lint             # eslint
pnpm typecheck        # tsc --noEmit
pnpm db:migrate       # apply drizzle migrations
pnpm run auth:bootstrap   # first admin (once per instance)
make check            # lint + typecheck + test
```

## Conventions

| Area            | Rule                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| Package manager | **pnpm only**                                                                   |
| Router          | Next.js **App Router** (`app/`), not Pages Router                               |
| Components      | Server Components default; `"use client"` only when needed                      |
| Mutations       | **Server actions** in `src/lib/actions/`; API routes only for file upload/serve |
| Database        | SQLite via Drizzle; schema in `src/db/schema/`; migrations in `drizzle/`        |
| Auth            | Lucia v3 + Argon2id — see [Authentication](design/02_auth.md)                   |
| Styling         | Tailwind v4 + Radix wrappers in `src/components/ui/`                            |
| Tests           | Vitest; in-memory DB: `DATABASE_URL=file::memory:?cache=shared`                 |
| Commits         | Conventional Commits (`feat:`, `fix:`, `chore:`) — enforced by lefthook         |

## Key paths

```
app/              # routes and layouts
src/db/           # drizzle client + schema
src/lib/          # auth, actions, notifications, mentions, attachments
src/components/   # UI
drizzle/          # SQL migrations (committed)
data/             # gitignored — hearth.db + uploads/
docs/             # documentation (this site)
docs/design/      # design docs (source of truth)
```

## Git hooks

Lefthook runs on commit and push:

| Hook         | Purpose                                      |
| ------------ | -------------------------------------------- |
| `pre-commit` | Lint, format check, typecheck (staged files) |
| `commit-msg` | Conventional Commits via commitlint          |
| `pre-push`   | Full test suite                              |

## Commit messages

Commitlint enforces [Conventional Commits](https://www.conventionalcommits.org/) on the
`commit-msg` hook. Important limits:

- **Subject:** `type: short description` — max 100 characters, no trailing period
- **Body:** optional; blank line after subject; **each body line max 100 characters**

```text
feat: add maintenance logs for home upkeep

- Add maintenance section for services, repairs, and reminders.
- Add API endpoints for maintenance CRUD and categories.
```

Wrap or split long bullets instead of one long sentence per line.

## Testing

```bash
pnpm test           # single run
pnpm test:watch     # watch mode
```

Integration tests use in-memory SQLite. Test helpers live in `src/lib/auth/test-helpers.ts` and domain-specific test files.

## Documentation

Docs are built with MkDocs Material:

```bash
make docs-install
make docs-serve     # http://127.0.0.1:8000
```

Edit pages under `docs/`. The site deploys to GitHub Pages on push to `main`.

## Do not

- Commit `.env`, `data/`, or secrets
- Add OAuth, Clerk, or Auth.js unless requirements change
- Add Postgres/MySQL or S3 unless requirements change
- Skip auth before building feature routes
- Run multiple app replicas against one SQLite file

## Pull requests

1. Fork and branch from `main`
2. Make focused changes with tests where appropriate
3. Run `make check` before pushing
4. Use Conventional Commits
5. Open a PR with a clear description

CI runs lint, format check, typecheck, and tests on every PR.

## Questions

- Product behavior unclear? → [Product Vision](design/00_init.md)
- Schema or routes unclear? → [Data Model](design/03_schema.md), [Routes & Structure](design/04_routes.md)
- Prefer design docs over guessing

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](about/license.md).
