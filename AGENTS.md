# Agent guide — hearth

Instructions for AI agents and contributors working in this repository.

## What this is

**hearth** is a household coordination web app — inventory, maintenance, projects, metrics, restaurants, and home log, each as a thin module on one shared core. **One instance = one household.** There is no `household` table or `household_id`; every active user is a member of the one household, and multiple homes are modeled as places.

The platform design lives in the OpenSpec change specs. See `openspec/changes/rebuild-p0-platform/design.md` for all decisions (D1–D21).

## Before you code

1. Read [`openspec/changes/rebuild-p0-platform/design.md`](openspec/changes/rebuild-p0-platform/design.md) for all decisions (core `entities` table, module registry, oRPC procedures, write pipeline, auth, places, operations)
2. Check [`openspec/changes/rebuild-p0-platform/tasks.md`](openspec/changes/rebuild-p0-platform/tasks.md) for the current phase — implement only that phase unless told otherwise
3. Follow the stack and module conventions below — do not swap libraries without explicit request

## Commands

```bash
pnpm install
pnpm dev              # local dev server
pnpm test             # vitest
pnpm lint             # eslint
pnpm typecheck        # tsc --noEmit
pnpm db:migrate       # apply drizzle migrations (app also migrates on start)
pnpm run auth:bootstrap   # first admin (once per instance)
pnpm jobs:tick        # run scheduler jobs from the CLI (for a stopped app)
pnpm search:rebuild   # rebuild the FTS5 search index
pnpm db:backup        # verified online backup to data/backups
pnpm db:restore <file># restore a backup (with the app stopped)
pnpm db:seed --large  # load the reference dataset
pnpm perf             # report p95 procedure times against the budgets
```

## Conventions

| Area            | Rule                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------- |
| Package manager | **pnpm only**                                                                                |
| Household model | **One household per instance**; no `household` table, no `household_id`                      |
| Router          | Next.js **App Router** (`app/`), not Pages Router                                            |
| Components      | Server Components default; `"use client"` only when needed                                   |
| Operations      | Every read/write is an **oRPC procedure** in `src/server/procedures/`; no ad-hoc handlers     |
| Adapters        | Server action `invoke(path, input)` in `src/lib/actions/invoke.ts`; REST `OpenAPIHandler` at `/api/v1`; server-only router client for Server Components |
| Mutation rule   | Use `write(ctx, fn, { prepare?, afterCommit? })`. `fn` runs in a synchronous `BEGIN IMMEDIATE` transaction — **do not `await` inside it** (types reject a promise return) |
| Module split    | `src/modules/<type>/{definition.ts, server.ts, ui.tsx}` + central indexes `src/modules/{definitions.ts, server.ts, ui.ts}` |
| Database        | SQLite via Drizzle; schema in `src/db/schema/`; migrations in `drizzle/`                     |
| Auth            | **Better Auth** behind `src/server/auth/*` (username, admin, `@better-auth/api-key` plugins); default scrypt hashing |
| Styling         | Tailwind v4 + **shadcn/ui** in `src/components/ui/`                                          |
| Tests           | Vitest; in-memory DB: `DATABASE_URL=file::memory:?cache=shared`                              |
| Commits         | Conventional Commits — see [Commit messages](#commit-messages)                               |

## Key paths

```
app/                        # routes and layouts
src/db/                     # drizzle client + schema
src/server/                 # auth, context, procedures, write pipeline
src/server/procedures/      # oRPC procedures
src/server/write.ts         # write(ctx, fn, { prepare?, afterCommit? })
src/modules/                # module definitions (definition.ts, server.ts, ui.tsx)
src/lib/actions/invoke.ts   # the `invoke` server action
src/components/ui/          # shadcn/ui
drizzle/                    # SQL migrations (committed)
data/                       # gitignored — hearth.db + uploads/ + backups/
docs/legacy/                # archived pre-rebuild docs (reference only)
```

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) when you commit.

| Rule                 | Limit                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Subject (first line) | ≤ 100 characters; `type: subject` (e.g. `feat: add maintenance logs`)                        |
| Body lines           | ≤ **100 characters each** — wrap or split long bullets                                       |
| Blank line           | Required between subject and body                                                            |
| Types                | `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`, `perf`, `style`, `revert` |

**Good example:**

```
feat: add maintenance logs for home upkeep

- Add maintenance section for services, repairs, and reminders.
- Add API endpoints for maintenance CRUD and categories.
- Add maintenance page and home dashboard section.
- Document maintenance in user guide and API reference.
```

**Bad:** one long bullet line (> 100 chars), subject ending with `.`, missing blank line after subject.

When drafting commit messages, count characters per line. Prefer shorter bullets over prose paragraphs.

## Do not

- Commit `.env`, `data/`, or secrets
- Add OAuth, Clerk, or Auth.js unless requirements change
- Add Postgres/MySQL or S3 unless requirements change
- Skip auth before building feature routes
- Go around the oRPC procedure layer for a read/write (open through the router client / REST / `invoke`)
- `await` inside a `write()` transaction callback
- Run multiple app replicas against one SQLite file
- Create git commits unless the user asks

## Implementation order

Follow the phases in [`openspec/changes/rebuild-p0-platform/tasks.md`](openspec/changes/rebuild-p0-platform/tasks.md):

1. Docs and scaffold → 2. Auth foundation → 3. Core data and write pipeline → 4. Operations → 5. Accounts → 6. Entities and registry → 7. Places → 8. Organization → 9. Collaboration → 10. Activity and inbox → 11. Reminders → 12. Search → 13. App shell and Today → 14. Integration and reliability

## Questions

If product behavior is unclear, check `openspec/changes/rebuild-p0-platform/proposal.md` (why) and `design.md` (how). If implementation shape is unclear, check `design.md` and `openspec/changes/rebuild-p0-platform/specs/platform/`. Prefer design docs over guessing.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
