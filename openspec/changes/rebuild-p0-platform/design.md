## Context

The repo holds only docs after commit `1054d66` (purged app). The old implementation is still in git history and is described in `docs/design/CURRENT_STATE.md` and `FEATURES.md`. See proposal.md (Why) for the motivation. Constraints:
- One instance = one household. Single Node process with one SQLite file on local disk (no replicas).
- Laptop-first, but every view must also work on mobile.
- Writes from AI/MCP clients are a first-class use case.
- `AGENTS.md`: pnpm, App Router, server actions for web mutations, Drizzle + SQLite, Tailwind v4. Next 16 has breaking changes: read `node_modules/next/dist/docs/` before writing route code.
- better-sqlite3 is synchronous. Drizzle's better-sqlite3 transactions use better-sqlite3's native transaction, which throws if the callback returns a promise. Every query also blocks the event loop while it runs.

## Goals / Non-Goals

**Goals:**
- Adding a new module means: one registry definition, one extension table + migration, and optional custom procedures and UI components.
- One code path per operation, reused by the web UI, REST, and later MCP.
- Shared services are built once and work for any entity.
- Cross-cutting effects of a write (activity, search index, inbox items) cannot be forgotten by a procedure.
- The household's data survives crashes, bad upgrades, and operator mistakes.

**Non-Goals:**
- Real domain modules (inventory, maintenance, projects, metrics, restaurants) and the Places UI pages. These ship in P1–P4. P0 builds only the places *service*, the switcher, and a minimal places page.
- The MCP server itself (P5). P0 only guarantees the procedure catalog it will be generated from.
- User-defined types or custom fields.
- Multiple households per instance. Adding them later means: a `households` table, a `household_id` column on `entities`, `tags` and `activity`, and one change in the access middleware (D3). Every other table is reached through an entity.
- Email/push notifications, real-time updates between open tabs.
- Off-site backup. P0 writes local backups; copying `data/` elsewhere is the operator's job (documented).

## Decisions

### D1. Core `entities` table + per-module extension tables
```
entities(id, type, title, place_id? -> entities ON DELETE SET NULL,
         version, created_by, created_via, updated_by, updated_via,
         created_at, updated_at, archived_at?, deleted_at?, trash_batch_id?)
<module>_details(entity_id PK -> entities ON DELETE CASCADE, ...typed columns)
```
- **Why:** one id space for links, tags, comments, reminders, search and activity. Typed columns stay typed per module.
- Ids are `crypto.randomUUID()` text (lowercase hex and `-`), so path prefixes (D7) never contain SQL wildcard characters.
- `created_via` / `updated_via` hold `null` for web or a snapshot of the API key name. A later rename or revocation does not rewrite history.
- `version` increments on every write to the entity row (D13).
- `created_by` / `updated_by` reference users with `ON DELETE RESTRICT`. Users are disabled, never deleted (D6).
- Indexes: `(type, deleted_at, archived_at, updated_at, id)`, `(place_id)`, `(deleted_at)`, `(trash_batch_id)`.
- **Alternatives:** (a) a separate table per module, with polymorphic `(entity_type, entity_id)` references everywhere. This is what the old app did; there was no FK integrity and the entity-type lists drifted. (b) One JSON blob per entry. This loses types and indexes. (c) A `custom_fields` JSON column. Dropped: nothing would edit it, and adding a column later is one migration.

### D2. Module registry (`src/modules/<type>/`)
Each module is split in three files so client bundles never import Drizzle or better-sqlite3:
- `definition.ts` (isomorphic): `type`, labels, icon, zod `fields` schema (labels via `.meta()`), `listColumns`, `filters`, `sorts`, `placeRule` (`required|prominent|optional|hidden`), `features` (notes, comments, attachments{documents?}, reminders, assignees, links, tags), `quickCreate` fields.
- `server.ts` (`server-only`): the details table, `searchText(details)`, `summary(entity)`, optional custom procedures and child tables.
- `ui.tsx` (optional): detail-section and list-row overrides.

Central indexes `src/modules/definitions.ts`, `src/modules/server.ts` and `src/modules/ui.ts` import every module.
- The registry generates the module's procedures (D3): `list`, `get`, `create`, `update`, `archive`, `unarchive`, `delete`, `restore`, routed at `/api/v1/<module>`. Nav, quick-create, generic list/detail pages (`app/(app)/[module]/...`), OpenAPI and search indexing all iterate the registry.
- `sorts` names the only sortable columns. Each maps to an indexed column on `entities` or the details table, which keeps cursor pagination (D16) generic.
- **Child records** (project components, metric entries) are module-owned tables with custom procedures at `/api/v1/<module>/{id}/<child>`. They are not entities. If a child needs shared features, it is its own module linked with `part_of`.
- A type-level test asserts that the zod `fields` keys equal the details table's insert columns.
- **Alternative:** convention-based file discovery. Rejected because it is less type-safe and harder for agents to follow.

### D3. Operations are oRPC procedures (`src/server/`)
- Every read and write is an oRPC procedure with a zod input and output. The root router combines shared-feature procedures (`src/server/procedures/*`) with the procedures generated from the registry.
- **Context** (`src/server/context.ts`): `{ user, via: 'web' | { apiKeyId, name }, now, requestId }`, built from the session cookie or the bearer key. It is cached per request.
- **Middleware**, the only place authorization lives:
  - `member`: requires an active user.
  - `admin`: requires the admin role.
  - `sessionOnly`: rejects API key callers with `forbidden`. Used for admin, API key management and password change.
  - `entityAccess(feature?)`: loads the target entity. Returns `not_found` if it is missing or trashed (unless the procedure allows trashed entities), and `forbidden` if the module does not enable the feature. The write pipeline re-checks inside its transaction.
- **Adapters:**
  - **Server Components** read through a server-only router client (`createRouterClient`) with the session context.
  - **Web mutations** go through one server action, `invoke(path, input)` in `src/lib/actions/invoke.ts`. It resolves the procedure from the router, calls it with the session context, returns `[error, data]`, and calls `refresh()` after a successful write so Server Components re-render in the same round trip. A typed client helper infers input and output from the router type. Thrown errors are never used across the action boundary (Next hides their messages in production).
  - **REST:** `OpenAPIHandler` in `app/api/v1/[[...rest]]/route.ts`, bearer keys only (no cookies, so no CSRF surface). Every procedure declares a route: modules at `/api/v1/<module>`, shared features at `/api/v1/entities/{id}/<feature>`, plus `/api/v1/places`, `/api/v1/search`, `/api/v1/inbox` and `/api/v1/activity/{id}/undo`.
  - **MCP (P5):** generated by walking the router (`traverseContractProcedures`).
- **Errors:** procedures throw `ORPCError` with our codes (`validation_error`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `rate_limited`, `internal_error`) and explicit statuses. One interceptor maps zod input failures to `validation_error` with `details[{path, message}]`, and maps unknown errors to `internal_error`, which is logged with the `requestId`. REST uses `customErrorResponseBodyEncoder` to emit `{ error: { code, message, details?, requestId } }`; `invoke` returns the same object as its error element.
- **Alternatives:** a hand-rolled operation catalog (rejected: oRPC already provides the catalog, OpenAPI routing, and actionable clients); tRPC (no first-class OpenAPI); per-procedure `.actionable()` exports (rejected: generated module procedures would need hand-written exports); oRPC `RPCHandler` for the web (rejected: a second round trip to refresh Server Components and a third HTTP surface).

### D4. Write pipeline (`src/server/write.ts`)
`write(ctx, fn, { prepare?, afterCommit? })` is the only way to change data:
1. `prepare` (async, optional) does I/O before the transaction: file sniffing and temp-file writes, Better Auth calls.
2. `fn(tx, changes)` runs inside one `BEGIN IMMEDIATE` transaction. It must be synchronous; its type rejects a promise return, so an `await` inside cannot slip in. `fn` changes rows through helpers that record what changed: entity field diffs, set deltas (`{added, removed}` for tags, assignees and links), notes revisions, attention requests, and touched entity ids.
3. Before commit the pipeline flushes the change set: activity rows (coalesced, D12), a search reindex of each touched entity (D10), and attention rows (`ON CONFLICT DO NOTHING` on the occurrence key). If the call carries an idempotency key (D13), the result is stored in the same transaction.
4. `afterCommit` (optional) runs only after a successful commit: renaming uploaded files into place, deleting purged files. Failures there are logged and repaired by the daily sweep (D11).
- **Why:** with about 12 shared services, per-service bookkeeping would be forgotten somewhere. Here activity, search and inbox items cannot drift from the data. The transaction cannot be an oRPC middleware, because middleware wraps an async `next()`. A manual `BEGIN` around awaits would let statements from other requests join the open transaction.

### D5. OpenAPI from the router
- `OpenAPIGenerator` with `ZodToJsonSchemaConverter` (`@orpc/zod/zod4`) walks the same router the handlers serve. The document has concrete field schemas and the custom error body schema, which fixes the old placeholder problem. `/api/openapi.json` serves it and Scalar renders `/api/docs`; both are public.
- **Alternative:** `@asteasolutions/zod-to-openapi`. Dropped: it would need a second registration of every route.

### D6. Auth: Better Auth
- **Plugins:** `username`, `admin` (role `admin` vs `user`, ban = disable), and the API key plugin from the separate `@better-auth/api-key` package. Its Drizzle adapter stores the tables in the same SQLite DB.
- **Accounts:**
  - Better Auth requires a unique email, so accounts get a synthetic `<username>@users.hearth.invalid` that is never shown.
  - Usernames are immutable after creation.
  - Passwords use Better Auth's default scrypt hashing (`AGENTS.md` is updated; Argon2id is no longer required).
- **Sessions:** 30 days. The cookie cache stays **off**, so disabling a user takes effect on the next request; the cost is one indexed read per request.
- **HTTP surface:** `app/api/auth/[...all]/route.ts` forwards only an allowlist: sign-in by username, sign-out, get-session. Every other Better Auth endpoint returns 404: sign-up, the admin endpoints (set-role, ban, remove-user, impersonate, set-password), API key CRUD and update-user. Our procedures call `auth.api.*` server-side, so last-admin guards and session-only rules cannot be bypassed. An allowlist also keeps endpoints added by future plugin versions closed.
- **API keys:**
  - The plugin's per-key rate limit (on by default, 10 requests per 24 h) is disabled.
  - The bearer adapter verifies the key once per request, then loads the owner and rejects banned users with 401; the plugin itself does not check bans on verify.
  - Keys act as their owner, but `sessionOnly` procedures reject them.
- **Sign-in limiter:** our own, in a Better Auth `before`/`after` hook on the sign-in path. It counts **failed** attempts per `lower(username)|ip` in an in-memory map: 5 failures in 15 minutes reject further attempts with `rate_limited`, and a success clears the count. Entries are pruned on every scheduler tick. The client IP comes from forwarding headers only when `TRUST_PROXY=1`, otherwise from the socket. Better Auth's IP-based limiter stays on for other paths.
- **Bootstrap:** the script creates the first admin through Better Auth's server API and refuses if any user exists.
- **Alternative:** keep the custom session store. Rejected because API keys, admin actions and rate limiting would all be ours to maintain.

### D7. Places as a materialized path
- `places(entity_id PK -> entities ON DELETE CASCADE, kind, path text unique)`. A place's parent is its own `entities.place_id`, so the tree uses the same column as every placed entity. `path` is `/<rootId>/<childId>/.../`.
- **Rules:** properties have no parent; every other kind must have one. `place_id` on any entity must reference a place. The places module uses `placeRule: hidden` and its own parent picker.
- **Subtree query:** a prefix range on the indexed path, `path >= :p AND path < :p || '~'`. It uses the index; `LIKE` would not with binary collation.
- **Move** (`places.move`): rejects a target inside the moved subtree, then rewrites the path prefix of every descendant in one transaction.
- **Scope:** the property scope is stored in `user_preferences.property_scope`. One SQL fragment applies it everywhere (lists, Today, search, due feed): an entity is in scope if it has no place, if its place's path is in the property subtree, or if it is itself a place in that subtree.
- **Trash:** deleting a place sets `deleted_at` and one shared `trash_batch_id` on the place and every non-trashed descendant. Restoring restores the batch. A place cannot be restored while its parent is trashed (`conflict`). On purge, placed entities become unplaced through `ON DELETE SET NULL`.
- **Alternative:** a closure table. Reads are cheaper there, but writes are more complex. The tree is small (hundreds of rows), so a path is enough.

### D8. Shared services tables
All child tables reference `entities(id) ON DELETE CASCADE` (purge removes them), except `entities.place_id` (`SET NULL`, D7). Soft delete leaves rows intact.
- `tags(name unique COLLATE NOCASE)`, `entity_tags`
- `entity_links(from_id, to_id, relation, unique(from_id, to_id, relation))`. `related` is symmetric and stored with `from_id < to_id`.
- `entity_urls`
- `attachments(entity_id, filename, mime, size, storage_key, has_thumb, created_by, deleted_at)` (D15)
- `notes(entity_id PK, doc json, markdown, version, updated_by, updated_at)` (D9)
- `comments(entity_id, author_id, doc json, markdown, edited_at)`
- `mentions(source_type note|comment, source_id, user_id)`: the current mention set per source, used for diffing.
- `entity_assignees`
- `reminders(entity_id, title, kind interval|one_time, every_count, every_unit, due_on date, closed_at, last_completed_at, last_completed_by)` (D14), index `(closed_at, due_on)`
- `reminder_recipients`
- `activity(entity_id, actor_id, api_key_id?, via_label?, action, diff json, created_at, updated_at, undoes_id?, undone_by_id?)`, index `(created_at)` and `(entity_id, created_at)`
- `attention(user_id, reason mention|assigned|reminder, entity_id, source_type, source_id, occurrence_key, created_at, read_at, dismissed_at, resolved_at, unique(user_id, occurrence_key))`, index `(user_id, resolved_at, dismissed_at, read_at, created_at)`
- `pins(user_id, entity_id)`, `user_preferences(user_id, property_scope, theme)`
- `idempotency_keys(api_key_id, key, request_hash, response json, created_at)` (D13), `job_runs(name, last_started_at, last_succeeded_at, last_error)` (D11)
- `search_index`: FTS5 virtual table (D10)

Occurrence keys (`writeId` is the id of the write's activity entry): `mention:<sourceType>:<sourceId>:<userId>:<writeId>`, `assigned:<entityId>:<userId>:<writeId>`, `reminder:<reminderId>:<dueOn>:<userId>`. Only reminder keys repeat across writes, which is what makes the scheduler idempotent.

### D9. Rich text: Tiptap document + Markdown, both accepted
- Notes and comments share one rich-text value. A write accepts either `{ doc }` (ProseMirror JSON, sent by the editor) or `{ markdown }` (API and agents). The server derives the other form with `@tiptap/markdown`'s `MarkdownManager` (it runs in Node) and stores both. Reads return both. The document is canonical; Markdown output is normalized, and the write response returns it so a client sees what was stored.
- Supported content: headings, lists, checklists, links, mentions. Unsupported Markdown degrades to paragraphs.
- Mentions are nodes holding user ids. In Markdown they are `@username`; on Markdown input, `@username` of an active member becomes a mention node. Usernames are immutable (D6), so the Markdown stays stable.
- Mention diffs compare the user-id sets before and after a save (spec: only notify on new mentions).
- **Limits:** notes documents up to 500 KB, comments up to 20 KB (`validation_error`). This stays under the 1 MB server-action body limit and bounds the synchronous conversion work.
- **Read view:** rendered on the server from the stored document. The editor bundle loads only when a member starts editing.
- **Autosave:** about 1.5 s after typing stops, and on blur, with `expectedVersion` (D13). A conflict shows "changed by X: reload or overwrite". Unsaved text is kept in `localStorage` until a save succeeds.

### D10. Search: SQLite FTS5
- `search_index(entity_id UNINDEXED, type UNINDEXED, title, body)` with `tokenize='unicode61 remove_diacritics 2'`, created in a hand-written SQL migration (Drizzle cannot model virtual tables).
- There is one row per non-purged entity. `reindex(entityId)` recomposes the whole row from title + `searchText(details)` + notes Markdown + comment Markdown. The write pipeline calls it for every touched entity, and `search:rebuild` loops over it. Visibility (archived and trashed) and scope come from joining `entities`.
- **Parser:** turns `type:`, `place:`, `tag:` and `@member` into filters. `place:<name>` matches every place with that name and unions their subtrees. The last free-text term gets a prefix match (`term*`) for search-as-you-type. Ranking is `bm25` with title weighted 10×, and `snippet()` highlights matches.
- **Palette:** cmdk, debounced 150 ms, returns up to 20 results through the router client.
- A daily job compares index rows with entities and rebuilds on mismatch (logged).

### D11. Jobs and scheduler
- `jobs.tick(now)` is a plain function. On every tick it runs the reminder job; once per day (tracked in `job_runs`) it runs trash purge, the attachment orphan sweep, the search consistency check, backup, expired-session cleanup and `PRAGMA optimize`. Each job is isolated: a failure is logged and recorded in `job_runs` and does not stop the others.
- `instrumentation.ts` starts it with `setInterval` every 5 minutes, plus one tick at startup, which catches up after downtime. It is guarded by `NEXT_RUNTIME === 'nodejs'`, `NEXT_PHASE !== 'phase-production-build'`, and a `globalThis` flag so dev reloads do not start a second timer. A running flag prevents overlap.
- Purge works in batches of 200 entities per transaction, so the event loop is never blocked for long.
- `pnpm jobs:tick` runs the same function from the CLI, for when the app is stopped.
- **Alternatives:** `node-cron` (unneeded dependency for two intervals); an external cron hitting `POST /api/cron` (adds a secret, a public route, and deploy steps).

### D12. Activity and undo
- Each write stores `{field: [before, after]}` for fields, `{added, removed}` for sets, and the previous document for notes.
- **Coalescing:** consecutive `update` entries by the same actor and channel on the same entity within 5 minutes are merged into one stored row (first `before`, last `after`) unless another actor or an undo intervened. This bounds growth from autosave and makes "undo" revert an editing session.
- **Undoable actions:**

| Action | Undo | Refused when |
|---|---|---|
| create | trash | already trashed |
| update (fields, title, place) | restore `before` | a field no longer holds its `after` value |
| notes edit | restore the previous document | notes version changed since |
| archive / delete | unarchive / restore | already undone |
| tags, assignees, links | reverse each added/removed item | none (items already reverted are skipped) |
| attachment removal | restore the attachment | attachment purged |
| reminder completion | restore the previous due date and completion | reminder changed since |

- Comments are edited or deleted by their authors and are not undoable.
- Any active member may undo any entry. An undo is recorded as its own entry and is not itself undoable (no redo).

### D13. Concurrency and idempotency
- Updates, notes saves and reminder edits accept an optional `expectedVersion`. A mismatch returns `conflict` with the current version and leaves data unchanged. The web always sends it; for API clients it is optional (last write wins without it).
- Set changes (tags, assignees, links) are add/remove operations, so they commute and need no version.
- REST `POST` accepts an `Idempotency-Key` header. Inside the write transaction the pipeline looks up `(api_key_id, key)`:
  - a hit with the same request hash returns the stored response without writing;
  - a hit with a different hash returns `conflict`;
  - a miss writes and stores the response in the same transaction (exactly once).
  - Keys expire after 24 h (daily job).

### D14. Reminders are date-based
- `due_on` is a calendar date (`YYYY-MM-DD`). The instance time zone (`HEARTH_TIMEZONE`, IANA name, default `UTC`) is used only to compute "today". There is no time of day, so there are no DST problems.
- **Interval:** the first `due_on` is chosen at creation (default: creation date + interval). Completion sets `due_on = completion date + interval`. Changing the interval recomputes from the last completion (or creation). Month arithmetic clamps to month end (Jan 31 + 1 month = Feb 28/29).
- **One-time:** completion sets `closed_at`.
- **Reminder job:** selects open reminders with `due_on <= today` on active entities (not archived, not trashed). It resolves recipients (explicit recipients who are active → active assignees → all active members) and inserts attention with key `reminder:<id>:<due_on>:<user>`. Completion sets `resolved_at` on that reminder's open attention items.
- **Due feed:** open reminders with `due_on <= today + 14` whose resolved recipients include the current member, on active entities in scope. Overdue first, then by `due_on`. Resolution is done in SQL with `EXISTS` subqueries.

### D15. Attachments
- **Types:** JPEG, PNG, WebP and GIF up to 10 MB; PDF up to 25 MB where the module allows documents. The type is sniffed from content. HEIC is not accepted: browsers other than Safari cannot show it and sharp's prebuilt binaries cannot decode it, and iOS converts to JPEG on upload.
- **Upload paths:** an oRPC procedure, exposed as REST multipart at `/api/v1/entities/{id}/attachments` and called by a session-authenticated route `POST /api/attachments` (same-origin check) for the web.
  - The proxy matcher excludes `/api/*`, so upload bodies are not buffered and truncated at the proxy's 10 MB default.
  - Server actions are not used for files (1 MB body limit).
  - Requests with a `Content-Length` above the limit are rejected before reading.
- **Write sequence:**
  1. `prepare` writes `UPLOADS_DIR/tmp/<uuid>`, verifies type and size, and creates a 480 px WebP thumbnail with sharp (images only).
  2. `fn` inserts the row.
  3. `afterCommit` renames the files to `UPLOADS_DIR/<uuid>.<ext>` and `<uuid>.thumb.webp`.
  4. A failed transaction deletes the temp files.
- **Serving:** `GET /api/attachments/{id}[?size=thumb]` (session or bearer) streams from disk with `Content-Length`, `Cache-Control: private, max-age=31536000, immutable` (ids never change content), `X-Content-Type-Options: nosniff`, and the sniffed type.
- **Removal** sets `deleted_at` (undoable). Rows deleted for more than 30 days, and attachments of purged entities, are removed and their files unlinked after commit. The daily sweep deletes temp files older than 1 h and files without a row, and logs rows whose file is missing.

### D16. Lists and pagination
- One cursor pagination system for the UI (infinite scroll) and REST: `limit` 1–100 (default 50). The cursor encodes `{sort, lastValue, id}`; a cursor used with a different sort returns `validation_error`.
- Lists never run `COUNT(*)`. Rollup counts use one `GROUP BY type` over the place subtree.
- Shared data for a page (tags, assignees, place names, pins) is loaded with one `IN (...)` query per feature, never per row.
- The same filter parser serves list URLs and REST query parameters.

### D17. UI stack
- **shadcn/ui** (Radix) on Tailwind v4, using CSS-variable tokens for light/dark. `next-themes` handles the system theme.
- System sans font (Inter via `next/font` as the fallback), a neutral palette, and one warm accent. Old `DESIGN.md` is superseded.
- **Forms:** react-hook-form with `@hookform/resolvers/zod`, using the same schemas as the procedures. `validation_error` details map onto form fields.
- **Lists:** TanStack Table in one `<EntityList>`. Desktop shows columns; on mobile it collapses to stacked rows.
- **Charts:** shadcn chart (Recharts) is added in P3, when first used.
- **Toasts:** sonner, with Undo actions.
- The Today sections stream independently (Suspense). Tiptap and other heavy client code are code-split.

### D18. Sample module `notes-page` ("Household notes")
- Fields: title, `category` (enum: reference, how-to, contacts, other; optional), `review_on` (optional date). `placeRule: optional`. All shared features enabled; the notes feature is the body.
- The extra fields exercise enum and date fields in forms, filters, sorts, the API and OpenAPI. The places module exercises custom procedures and custom UI.
- It can be kept as a real module or removed later.

### D19. Performance
- **Database:** one connection with `journal_mode=WAL`, `synchronous=FULL` (durability matters more than write throughput at household volume), `foreign_keys=ON`, `busy_timeout=5000`, `temp_store=MEMORY`. `PRAGMA optimize` runs daily.
- **Reference dataset** (`pnpm db:seed --large`): 10,000 entities, 500 places, 50,000 activity rows, 2,000 reminders, 5,000 comments.
- **Budgets** (server time per procedure on a laptop, p95): list, detail and search ≤ 100 ms; Today ≤ 200 ms; one scheduler tick ≤ 200 ms. `pnpm perf` reports them.
- **CI** runs `EXPLAIN QUERY PLAN` on the list, search, Today, due-feed, inbox-count and tick queries and fails on a full scan of `entities`, `activity` or `attention`.
- Per request, the context, bell count and property scope are loaded once (React `cache`).
- **Known costs:** one session read per page request and one API key write (`lastRequest`) per API request. Both are fine for SQLite at this scale.

### D20. Reliability and operations
- **Startup:** open the DB and check pragmas → if migrations are pending, take a backup to `data/backups/pre-migrate-<timestamp>.db`, then migrate → start the scheduler. If a migration fails, the process logs and exits non-zero instead of serving a half-migrated schema; the pre-migration backup is the restore point. `pnpm db:migrate` remains for dev and CI.
- **Backups:** daily online backup with better-sqlite3's `db.backup()` to `data/backups/hearth-<date>.db`, checked with `PRAGMA integrity_check` on the copy; keep 7 daily and 4 weekly. `pnpm db:backup` and a documented restore (`pnpm db:restore <file>` with the app stopped). Uploads are files and are backed up by copying `data/uploads` (documented). Only the app process writes while it runs (CLI write scripts are for a stopped app), because writes from a second connection restart an online backup.
- **Health:** public `GET /api/health` → 200 `{ ok, checks }` when the DB answers and the last tick is under 15 minutes old; otherwise 503 naming the failing check. No household data is included.
- **Logs:** one JSON line per API request (method, route, status, duration, requestId, via) and per job run, to stdout. Internal errors log the stack; responses carry only `requestId`.
- **Shutdown:** on SIGTERM/SIGINT stop the timer, wait for a running tick, and close the DB (which checkpoints the WAL).
- **Storage:** `data/` must be on a local disk. WAL needs shared memory and POSIX locks, which network file systems do not reliably provide.

### D21. Testing
- Vitest calls procedures through the server-side router client against an in-memory SQLite DB with migrations applied (no ad-hoc table helpers) and an injected clock (`ctx.now`).
- A contract test walks the router: every routed procedure gives the same error code and details through `invoke` and through REST for the same invalid input.
- Playwright smoke tests cover: sign in, create a sample entity, mention, reminder due → inbox, undo, conflicting notes edit, mobile viewport.
- Operations tests cover: backup + integrity check, pre-migration backup, failed migration exits, idempotent tick, job isolation.

## Risks / Trade-offs

- **[Generic UI feels generic]** Registry-driven pages can look like a database admin tool. → Every module can override its detail and list rows. P1 must design Inventory as a real product surface, not the default view.
- **[Better Auth / oRPC churn]** → Pin versions. Better Auth sits behind `src/server/auth/*`, so the rest of the app only sees `ctx.user`. Procedures are plain functions with zod schemas, so moving off oRPC would only touch the adapters.
- **[Synchronous SQLite blocks the event loop]** A slow query stalls every request. → Indexed queries (CI `EXPLAIN` check), budgets, batched purge, rebuilds only from the CLI or a daily job.
- **[Shared tables grow]** → Activity coalescing, indexes on `(created_at)` and `(entity_id, created_at)`, expiry of idempotency keys and sessions. Activity compaction is deferred.
- **[Markdown round trip loses content]** Agents may send syntax the editor does not support. → It degrades to paragraphs, and the write response returns the stored Markdown.
- **[Single process]** The in-memory sign-in limiter resets on restart; there is no failover. → Accepted for a household; replicas are already ruled out by SQLite.
- **[Durability]** A crash or bad upgrade could lose data. → `synchronous=FULL`, daily verified backups, a pre-migration backup, fail-fast startup, local disk only.
- **[Large P0 before anything visibly useful]** → Build in vertical slices: auth → write pipeline → one sample module → each shared service, end to end in the UI, before starting the next.
- **[FTS drift]** → Reindex inside the write transaction, a daily consistency check, and a `search:rebuild` script.

## Migration Plan

- Clean start: no data migration.
- Move `docs/` (design, user guide, reference, operations, getting started, admin, architecture), `DESIGN.md` and `PRODUCT.md` to `docs/legacy/`. Write a short new `docs/design/README.md` that points to the OpenSpec specs, rewrite `README.md`, and update `AGENTS.md`.
- Deploy: set `BETTER_AUTH_SECRET`, `DATABASE_URL`, `UPLOADS_DIR`, `HEARTH_TIMEZONE` and, behind a reverse proxy, `TRUST_PROXY=1`. Start the app (it migrates on start), then run `pnpm auth:bootstrap`.
- Rollback: restore the latest backup from `data/backups/` with the app stopped. The previous app can be recovered from git (`9be82e5`), but its data is not compatible.

## Open Questions

- Accent color and logo mark. Decide during UI polish; this does not affect the specs.
- Whether the sample module ships as "Household notes" or gets removed after P1.
