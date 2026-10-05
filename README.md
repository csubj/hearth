# hearth

hearth is a household coordination web app — inventory, maintenance, projects, metrics, restaurants, and a home log, all as thin modules on one shared core. **One instance = one household.** Every active user is a member of the one household; multiple homes are modeled as places.

The platform is rebuilt around a single module registry, so each domain is a definition on top of one shared core (entities, tags, links, attachments, notes/comments, reminders, activity, search, places).

## Stack

| Layer     | Choice                                       |
| --------- | -------------------------------------------- |
| Framework | Next.js 16 (App Router) + React 19           |
| Language  | TypeScript                                   |
| Database  | SQLite + Drizzle ORM                         |
| Auth      | Better Auth (username, admin, API-key plugins) |
| Operations| oRPC procedures in `src/server/procedures`   |
| Styling   | Tailwind v4 + shadcn/ui                      |
| Tests     | Vitest, Playwright                           |

## Commands

```bash
pnpm install
pnpm dev              # local dev server
pnpm test             # vitest
pnpm lint             # eslint
pnpm typecheck        # tsc --noEmit
pnpm db:migrate       # apply drizzle migrations (app also migrates on start)
pnpm run auth:bootstrap   # first admin (once per instance)
pnpm jobs:tick        # run scheduler jobs from the CLI
pnpm search:rebuild   # rebuild the FTS5 search index
pnpm db:backup        # verified online backup to data/backups
pnpm db:restore <file># restore a backup (with the app stopped)
pnpm db:seed --large  # load the reference dataset
pnpm perf             # report p95 times against the budgets
```

## Design docs

The design is in the OpenSpec change specs under [`openspec/`](openspec/):

- [`openspec/changes/rebuild-p0-platform/proposal.md`](openspec/changes/rebuild-p0-platform/proposal.md) — motivation and what changes.
- [`openspec/changes/rebuild-p0-platform/design.md`](openspec/changes/rebuild-p0-platform/design.md) — all decisions (D1–D21).
- [`openspec/changes/rebuild-p0-platform/tasks.md`](openspec/changes/rebuild-p0-platform/tasks.md) — phased implementation checklist.
- [`openspec/changes/rebuild-p0-platform/specs/platform/`](openspec/changes/rebuild-p0-platform/specs/platform) — per-capability specs.

See [`docs/design/README.md`](docs/design/README.md) for the doc structure and the archive of pre-rebuild design docs in `docs/legacy/`.

## Backups & restore

The app creates a verified backup of `data/hearth.db` once per day while
running, writing to `data/backups/hearth-<YYYY-MM-DD>.db`. Each backup is
checked with `PRAGMA integrity_check` on the copy. The scheduler keeps
7 recent daily backups plus 4 weekly checkpoints; older files are deleted.

```bash
pnpm db:backup          # run a backup now (app may be running)
pnpm db:restore <file>  # restore a backup — STOP THE APP FIRST
```

**Restore procedure:**

1. Stop the app (`SIGTERM` or `Ctrl-C`).
2. Copy the backup file you want to restore:
   ```bash
   pnpm db:restore data/backups/hearth-2025-01-15.db
   ```
   This overwrites `data/hearth.db` and removes any WAL/SHM sidecar files.
3. If you also backed up `data/uploads` (attachment files are not included in
   the database backup), copy that directory back into place:
   ```bash
   cp -r /your/uploads-backup/uploads data/uploads
   ```
4. Start the app again.

> **Note:** attachment files (`data/uploads/`) are stored outside the database.
> Back them up by copying the directory. `pnpm db:backup` backs up only the
> SQLite database.

## Contributing

Read [`AGENTS.md`](AGENTS.md) first — stack conventions, the module split, the `write()` rule, and commands.
