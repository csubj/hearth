# Design docs — hearth

Index for humans and agents. Read in order when implementing from scratch.

| Doc | Purpose |
|-----|---------|
| [00_init.md](./00_init.md) | Product vision, features, principles |
| [01_tech.md](./01_tech.md) | Stack choices (Next.js, SQLite, pnpm, Vitest, …) |
| [02_auth.md](./02_auth.md) | Users, sessions, admin, bootstrap |
| [03_schema.md](./03_schema.md) | Drizzle tables, enums, relationships |
| [04_routes.md](./04_routes.md) | App Router structure, server actions, API routes |
| [05_styling.md](./05_styling.md) | Tailwind, Radix wrappers, UI patterns |
| [06_notifications.md](./06_notifications.md) | Activity feed, fan-out, @-mentions |
| [07_attachments.md](./07_attachments.md) | Photo upload, local storage, serving |
| [08_mvp.md](./08_mvp.md) | Build phases 0–7 and acceptance criteria |
| [09_deploy.md](./09_deploy.md) | Docker, env vars, volumes, backup |
| [10_ci.md](./10_ci.md) | GitHub Actions workflow |

## Quick paths

- **Start building:** `08_mvp.md` → current phase → linked docs
- **Add a feature:** `00_init.md` (product) → `03_schema.md` → `04_routes.md` → `06_notifications.md`
- **Run locally:** `09_deploy.md` (Local development)
- **Agent entrypoint:** [`../../AGENTS.md`](../../AGENTS.md)

## Status

All docs `status: decided` as of 2026-06-14. Update frontmatter `version` / `last_updated` when conventions change.
