## 1. Docs and scaffold

- [ ] 1.1 Move all old docs to `docs/legacy/`: `docs/design/*`, `docs/user-guide`, `docs/reference`, `docs/operations`, `docs/getting-started`, `docs/admin`, `docs/architecture`, `docs/index.md`, `DESIGN.md` and `PRODUCT.md`. Write a new short `docs/design/README.md` that points to the OpenSpec specs, and rewrite `README.md`. Verify that no broken relative links remain (`rg "docs/design/0|user-guide/" -g "*.md"`).
- [ ] 1.2 Update `AGENTS.md`: one household per instance, Better Auth, oRPC procedures in `src/server/procedures`, the `write()` rule (no `await` inside), the module file split, the `invoke` action, shadcn, and the new scripts (`jobs:tick`, `search:rebuild`, `db:backup`, `db:restore`, `db:seed`, `perf`). Verify by reading the file.
- [ ] 1.3 Scaffold Next 16 + React 19 + TypeScript + Tailwind v4 with pnpm. Read `node_modules/next/dist/docs/` first (proxy, instrumentation, `refresh`, server action limits). Verify that `pnpm dev` serves a page and `pnpm build` succeeds.
- [ ] 1.4 Add ESLint, Prettier, Vitest and Playwright configs, plus `test`, `lint`, `typecheck`, `e2e` scripts. Verify all four scripts pass on the empty app.
- [ ] 1.5 Add Drizzle + better-sqlite3 with `DATABASE_URL`: one connection with WAL, `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000`; `db:generate` and `db:migrate`; a test helper that applies migrations to in-memory SQLite. Verify with a test that asserts the pragmas on a file DB and that the in-memory helper migrates.
- [ ] 1.6 Initialize shadcn/ui with light/dark CSS tokens, `next-themes` and sonner. Verify that a demo button renders in both themes.
- [ ] 1.7 Add a CI workflow running lint, typecheck, test and build. Verify that CI passes on the branch.

## 2. Auth foundation

- [ ] 2.1 Integrate Better Auth behind `src/server/auth/*`: `username`, `admin`, and `@better-auth/api-key` (per-key rate limit disabled), Drizzle adapter, sign-up disabled, 30-day sessions, cookie cache off, synthetic `@users.hearth.invalid` emails, immutable usernames. Mount `/api/auth/*` with an allowlist (sign-in by username, sign-out, get-session). Verify that migrations create the auth tables and that tests get 404 from `/api/auth/sign-up/email` and `/api/auth/admin/set-role`.
- [ ] 2.2 Add the `auth:bootstrap` script that creates the first admin and refuses when users exist. Verify with Vitest covering both cases.
- [ ] 2.3 Build the login page and logout, with sanitized `returnTo` and a generic error. Add `proxy.ts` with a matcher for app pages only (not `/api/*`) that redirects when no session cookie exists. Verify with a Playwright test for sign-in, redirect and wrong password.
- [ ] 2.4 Add the failed-attempt limiter on sign-in: 5 failures per `username|ip` in 15 minutes, reset on success, IP from forwarding headers only with `TRUST_PROXY=1`, map pruned on tick. Verify with tests: the 6th attempt is `rate_limited` even with the right password, another IP is not blocked, and a success resets the count.

## 3. Core data and service pipeline

- [ ] 3.1 Create the `entities` table (UUID ids, type, title, `place_id` with `ON DELETE SET NULL`, version, created/updated by and via, timestamps, `archived_at`, `deleted_at`, `trash_batch_id`) and its indexes, plus `activity`, `attention`, `idempotency_keys`, `job_runs`, and the FTS5 `search_index` in a hand-written SQL migration. Verify that migrations apply and that a test shows deleting a referenced entity nulls `place_id`.
- [ ] 3.2 Build the oRPC base: context from session cookie or bearer key (rejects revoked keys and banned owners), `requestId`, `now`; `member`, `admin`, `sessionOnly` and `entityAccess(feature)` middleware; error codes with statuses, the validation interceptor, and the error body encoder. Verify with unit tests: each code maps to its HTTP status, a banned owner's key gets 401, an API key on a `sessionOnly` procedure gets 403, and an unknown error returns `internal_error` with a logged `requestId`.
- [ ] 3.3 Implement `write(ctx, fn, { prepare, afterCommit })`: a synchronous `BEGIN IMMEDIATE` transaction (promise-returning callbacks rejected by types), a change set that records field diffs and set deltas, activity coalescing, reindex of touched entities, attention inserts deduplicated by occurrence key, and idempotency records. Verify with tests: a thrown error leaves no activity, index or attention rows; `afterCommit` does not run on rollback; three updates within 5 minutes make one activity row; a duplicate occurrence key inserts once; a replayed idempotency key returns the stored result without writing.
- [ ] 3.4 Build the adapters: the server-only router client for Server Components, the generic `invoke(path, input)` server action returning `[error, data]` and calling `refresh()`, its typed client helper, and `OpenAPIHandler` at `/api/v1/[[...rest]]` (bearer only) with `Idempotency-Key` support. Verify with a test procedure that is reachable through all three and gives the same error body through `invoke` and REST.
- [ ] 3.5 Implement `jobs.tick(now)` with per-job error isolation, daily jobs tracked in `job_runs`, and an overlap guard. Start it from `instrumentation.ts` (Node runtime, not during build, once per process): one tick at startup, then every 5 minutes. Add the `pnpm jobs:tick` CLI. Verify with fake-clock tests: a daily job runs once per day, a failing job does not stop the others, and dev reload does not start a second timer.

## 4. Operations

- [ ] 4.1 Implement the startup sequence: check pragmas, back up if migrations are pending, migrate, exit non-zero naming the backup if a migration fails. Add graceful shutdown (stop the timer, wait for the tick, close the DB). Verify with tests: a pending migration produces a backup first, and a broken migration exits without serving.
- [ ] 4.2 Add the daily online backup job (integrity-checked, 7 daily + 4 weekly retention), `pnpm db:backup`, `pnpm db:restore <file>`, and a documented restore procedure, including `data/uploads`. Verify with tests: a backup passes `integrity_check` and retention deletes the right files.
- [ ] 4.3 Add public `GET /api/health` (DB check, last tick age, failing jobs) returning 200 or 503 with no household data. Verify with tests for healthy, stale scheduler and failed job.
- [ ] 4.4 Add structured JSON logs for API requests (method, route, status, duration, requestId, via) and job runs. Verify with a test that captures log lines for one request and one tick.

## 5. Accounts

- [ ] 5.1 Build the admin users page on admin + `sessionOnly` procedures: create user, reset password, disable/enable, promote/demote, with last-admin guards; disable revokes sessions. Verify with procedure tests for the guards, session revocation, and that an admin's API key gets 403.
- [ ] 5.2 Build the settings page: display name, theme (light/dark/system), and password change that revokes other sessions. Verify with procedure tests and a manual theme check.
- [ ] 5.3 Build the API keys page (create shows the secret once, list by name/prefix/last used, revoke) on `sessionOnly` procedures. Verify with tests: a revoked key returns 401, a disabled user's key returns 401, `lastUsed` updates, and 500 requests in an hour are not quota-limited.

## 6. Entities and registry

- [ ] 6.1 Implement the module split (`definition.ts`, `server.ts`, `ui.tsx`), `defineModule()` types, and the three central indexes. Verify that typecheck rejects an invalid definition and that a type test fails when zod fields and details columns differ.
- [ ] 6.2 Generate module procedures from the registry: `list` (cursor with declared sorts, filters, per-page batch loading), `get`, `create`, `update` (with `expectedVersion`), `archive`, `unarchive`, `delete`, `restore`, routed at `/api/v1/<module>`. Verify with tests for validation errors, the cursor, a cursor with a changed sort (400), a stale version (409), and a disabled feature (403).
- [ ] 6.3 Add the sample `notes-page` module ("Household notes": category enum, optional `review_on` date, all shared features). Verify that create/list/get/update work through procedures and REST.
- [ ] 6.4 Build generic `app/(app)/[module]` list and detail routes driven by the registry, reading through the router client and writing through `invoke`. Verify that the sample module is usable in the browser.
- [ ] 6.5 Add the contract test that walks the router: it fails if any procedure has no REST route, and for every procedure the same invalid input gives the same code and details through `invoke` and REST. Later sections' procedures are covered automatically. Verify that it covers the sample module and the test procedure.
- [ ] 6.6 Generate OpenAPI from the router (`/api/openapi.json`, public) and serve Scalar at `/api/docs`. Verify that the sample module's fields and the error body appear with concrete types.
- [ ] 6.7 Add the trash view, restore by batch, and the daily purge job (batches of 200; attachment files unlinked after commit). Verify with a fake-clock test that a 31-day-old trashed entity and its files are gone and a 29-day-old one remains.

## 7. Places

- [ ] 7.1 Create the `places` extension (kind, unique materialized path) with the parent in `entities.place_id`, and register the places module (`placeRule: hidden`, its own parent picker). Verify with tests: a room without a parent and a property with a parent are both rejected.
- [ ] 7.2 Implement `places.move` with descendant path rewrite and cycle check, and subtree/exact queries using the path prefix range. Verify with tests that moving Pantry changes the rollup and that moving a place under its descendant is rejected.
- [ ] 7.3 Add the per-module place field driven by `placeRule`, and validate that `place_id` references a place. Verify that a hidden module shows no field, a required rule is enforced, and a non-place reference is rejected.
- [ ] 7.4 Build the property scope preference, the single scope filter used by lists, Today, search and the due feed (unplaced entities stay visible, inbox unscoped), and a header switcher. Verify with tests and by switching manually.
- [ ] 7.5 Build a minimal places page: tree, create/move, and a rollup view grouped by module with counts and a "this level only" toggle. Verify in the browser with two properties.
- [ ] 7.6 Make place deletion trash the subtree as one batch without deleting placed entities; restore by batch; refuse restoring a child of a trashed parent. Verify with tests, including that purge unplaces items.

## 8. Organization (tags, links, URLs, attachments)

- [ ] 8.1 Add tags with case-insensitive uniqueness, inline creation, add/remove procedures recorded as set deltas, and a list filter. Verify with tests and the UI chip filter.
- [ ] 8.2 Add `entity_links` with the relation set, two-sided labels, symmetric `related`, and duplicate → conflict, plus a "Related" detail section with an entity picker. Links to trashed entities are hidden. Verify with tests and the UI.
- [ ] 8.3 Add labeled external URLs. Verify that they render with `target=_blank` and `rel=noopener`.
- [ ] 8.4 Add attachments as one procedure (REST multipart plus a session route `POST /api/attachments`): content sniffing, size limits checked before reading, documents per module, temp file → row → rename after commit, sharp thumbnails, streamed serving with immutable caching, soft delete, and the daily orphan sweep. Verify with tests: a spoofed file is rejected, a 24 MB PDF round-trips byte-identical, an unauthenticated GET is 401, a disabled feature is 403, and a failed transaction leaves no file.

## 9. Collaboration

- [ ] 9.1 Implement the shared rich-text value: accepts a document or Markdown, stores both, normalizes Markdown, maps `@username` to mention nodes, extracts mention ids, and enforces size limits. Verify with unit tests: headings, lists, checklists and links round-trip; `@sam` becomes a mention of Sam; 500 KB+ is rejected.
- [ ] 9.2 Add the notes section: server-rendered read view, editor loaded on demand, autosave after typing pauses and on blur with `expectedVersion`, a conflict prompt (reload/overwrite), and a local draft kept until saved. Verify with Playwright: an edit persists after reload, a conflicting save shows the prompt, and unsaved text survives a reload.
- [ ] 9.3 Add comments (create, edit own, delete own/admin) using the rich-text value. Verify with procedure tests for the permissions and for Markdown input.
- [ ] 9.4 Add mention diffing for notes and comments. Verify with tests: a new mention notifies once, re-saving does not notify, and a mention written as Markdown by an API key notifies.
- [ ] 9.5 Add multiple assignees with an attention item on assignment (not for yourself). Verify with tests.

## 10. Activity and inbox

- [ ] 10.1 Build the activity feed on Today and detail pages, showing coalesced entries and "CJ via Claude". Verify with a rendering test and a test where a write via the API key "Claude" shows "via Claude".
- [ ] 10.2 Implement undo per the undoable-action table in design D12, with conflict checks; undo is recorded and not itself undoable; toast Undo on delete. Verify with tests for each action, for a conflict, and for undoing one tag while another was added.
- [ ] 10.3 Add the inbox page and bell count (9+), with mark read/all, dismiss, navigation to the entity, and items for trashed entities hidden. Verify with tests and Playwright.

## 11. Reminders

- [ ] 11.1 Add reminders (title, interval/one-time, `due_on` date, optional first due date, month-end clamping, `HEARTH_TIMEZONE` for "today") and recipients. Verify with unit tests: Jan 10 + 3 months = Apr 10, Jan 31 + 1 month = last day of February, the default first due date, and "today" across a time-zone boundary.
- [ ] 11.2 Implement recipient resolution (active recipients → active assignees → all active members) and completion (reschedule or close, clear open inbox items, undoable). Verify with tests.
- [ ] 11.3 Add the reminder job to the tick: open reminders due on active entities, one attention item per recipient per due date, paused for archived/trashed entities. Verify with tests: repeated runs create one item, an archived entity's reminder creates none, and a reminder that came due while stopped is processed at the startup tick.
- [ ] 11.4 Build the personal due feed (my resolved reminders, overdue first, 14-day window, scope-aware) and a detail-page reminders section showing all reminders. Verify with tests for the ordering and for someone else's reminder being absent.

## 12. Search

- [ ] 12.1 Add the query parser for `type:`, `place:` (all places with that name, subtree), `tag:`, `@member`, and a prefix match on the last term. Verify with unit tests.
- [ ] 12.2 Add the search procedure (bm25 with title weight, snippets, visibility and scope) and the daily consistency check with automatic rebuild, plus a `search:rebuild` script. Verify with tests: a created entity is found immediately, "alab" finds "Alabaster", and deleted index rows are restored by the check.
- [ ] 12.3 Build the cmdk palette (Cmd/Ctrl-K, debounced) with entity results, snippets and actions (create, go to, switch property). Verify with a Playwright keyboard-only test.

## 13. App shell and Today

- [ ] 13.1 Build a registry-driven sidebar (≥768px) and a mobile bottom bar with Today, Search, Create, Inbox and Menu. Verify with Playwright at 1280px and 390px, checking 44px targets.
- [ ] 13.2 Build global quick-create (pick a module, required fields only), with place/link prefill from context. Verify with a Playwright test from the places page.
- [ ] 13.3 Build the shared `<EntityList>` (search, filter chips, URL-synced filters, declared sorts, columns or stacked rows, infinite scroll) and the detail layout with inline field editing and the conflict message. Verify with Playwright: filters survive reload, an inline edit saves, and a stale inline edit keeps the typed value and offers reload.
- [ ] 13.4 Build the Today page (Needs you, Due soon from the personal due feed, Activity, Pinned) with sections streamed independently, empty states, and pin/unpin. Verify with Playwright.
- [ ] 13.5 Do an accessibility pass: AA contrast in both themes, visible focus, keyboard operability. Verify with axe in Playwright on the main pages.

## 14. Integration, performance and reliability checks

- [ ] 14.1 Run an end-to-end Playwright scenario: bootstrap → sign in → create two properties → create a sample entity in a room → tag, link, attach, comment @member → reminder due → member sees it in Inbox → undo an edit → find via `place:` search. Verify that it passes in CI.
- [ ] 14.2 Run an API smoke test: create a key → CRUD the sample module and add a tag and a Markdown comment via `/api/v1` → OpenAPI validates → activity shows "via <key>" → a replayed `Idempotency-Key` creates one entity. Verify with a scripted test.
- [ ] 14.3 Add `pnpm db:seed --large` (reference dataset from the operations spec) and `pnpm perf` reporting p95 per budget. Add a CI test that runs `EXPLAIN QUERY PLAN` on the list, search, Today, due-feed, inbox-count and tick queries and fails on a full scan of `entities`, `activity` or `attention`. Verify that `pnpm perf` meets the budgets on a laptop and that the CI test passes.
- [ ] 14.4 Run a restore drill: seed → backup → stop → restore into a fresh `data/` → start → data matches. Verify with a scripted test.
