# Agent guide — hearth

Instructions for AI agents and contributors working in this repository.

## What this is

**hearth** is a household coordination web app — shared stream, restaurants, projects, trackers, and events. One instance = one household. See [docs/design/00_init.md](docs/design/00_init.md).

## Before you code

1. Read [docs/design/README.md](docs/design/README.md) for the full doc index
2. Check [docs/design/08_mvp.md](docs/design/08_mvp.md) for the current build phase — implement only that phase unless told otherwise
3. Follow stack decisions in [docs/design/01_tech.md](docs/design/01_tech.md) — do not swap libraries without explicit request

## Commands (once scaffold exists)

```bash
pnpm install
lefthook install
pnpm dev              # local dev server
pnpm test             # vitest
pnpm lint             # eslint
pnpm typecheck        # tsc --noEmit
pnpm db:migrate       # apply drizzle migrations
pnpm run auth:bootstrap   # first admin (once per instance)
```

## Conventions

| Area | Rule |
|------|------|
| Package manager | **pnpm only** |
| Router | Next.js **App Router** (`app/`), not Pages Router |
| Components | Server Components default; `"use client"` only when needed |
| Mutations | **Server actions** in `src/lib/actions/`; API routes only for file upload/serve |
| Database | SQLite via Drizzle; schema in `src/db/schema/`; migrations in `drizzle/` |
| Auth | Lucia v3 + Argon2id — see [docs/design/02_auth.md](docs/design/02_auth.md) |
| Styling | Tailwind v4 + Radix wrappers in `src/components/ui/` |
| Tests | Vitest; in-memory DB: `DATABASE_URL=file::memory:?cache=shared` |
| Commits | Conventional Commits (`feat:`, `fix:`, `chore:`) — enforced by lefthook |

## Key paths

```
app/              # routes and layouts
src/db/           # drizzle client + schema
src/lib/          # auth, actions, notifications, mentions, attachments
src/components/   # UI
drizzle/          # SQL migrations (committed)
data/             # gitignored — hearth.db + uploads/
docs/design/      # design docs (source of truth)
```

## Do not

- Commit `.env`, `data/`, or secrets
- Add OAuth, Clerk, or Auth.js unless requirements change
- Add Postgres/MySQL or S3 unless requirements change
- Skip auth before building feature routes
- Run multiple app replicas against one SQLite file
- Create git commits unless the user asks

## Implementation order

Follow phases in [docs/design/08_mvp.md](docs/design/08_mvp.md):

0. Scaffold → 1. Auth → 2. Stream/Home → 3. Restaurants → 4. Projects/Events/Trackers → 5. Attachments → 6. Notifications → 7. Polish

## Questions

If product behavior is unclear, check `00_init.md`. If implementation shape is unclear, check `03_schema.md` and `04_routes.md`. Prefer design docs over guessing.
