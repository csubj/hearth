## Why

The original hearth app was purged because it felt hard to manage: 8 nav sections, ~30 tables, three separate reminder systems, four linking mechanisms, three tag systems, and a 9-widget home page. Each module re-implemented the same cross-cutting features differently, so the UX was inconsistent and adding new household knowledge meant rebuilding every layer. This change rebuilds the **platform** so that every domain module (inventory, maintenance, projects, metrics, restaurants, and future ones) is a thin definition on top of one shared core, with a modern, simple UI and an API that AI/MCP clients can use from day one.

## What Changes

- **BREAKING / clean start**: greenfield scaffold. No data migration from the purged app; all old docs move to `docs/legacy/` as reference.
- New stack baseline: Next 16 App Router, React 19, TypeScript, Tailwind v4, SQLite + Drizzle, zod, pnpm, Vitest, Playwright; **oRPC** for every operation; **Better Auth** (username, admin, and API-key plugins); **shadcn/ui**, react-hook-form, TanStack Table, cmdk, Tiptap (with Markdown support), sharp for image thumbnails, Recharts via shadcn charts.
- **One household per instance**: there is no household table or `household_id`. Every active user is a member of the one household. Multiple homes are modeled as places.
- **Core entity model**: one `entities` table (single id space, version number, soft delete) + typed per-module extension tables.
- **Module registry**: one definition per module drives nav, routes, forms, lists, search, Today, REST, OpenAPI and (later) MCP tools.
- **Operations as procedures**: every read and write is one oRPC procedure. Server actions, the REST/OpenAPI API, and later MCP are thin adapters over the same procedures. Writes record actor + channel (web or named API key, e.g. "CJ via Claude").
- **One write pipeline**: every write runs in one transaction that also records activity, updates the search index, and creates inbox items. Writes support conflict detection (stale version) and, over REST, idempotent retries.
- **Shared services**, each implemented once for all modules: tags, typed entity links, attachments, notes and comments (rich text, readable and writable as Markdown), @mentions, multiple assignees, reminders (interval or one-time, date-based), activity log with diffs + undo, attention inbox, full-text search.
- **Places hierarchy** as a shared service: multiple properties, nested structure/room/area, subtree rollups, `place:` filter, and a global property switcher.
- **App shell**: registry-driven sidebar (bottom bar on mobile), cmd-K search, global quick-create, property switcher, bell + Inbox, Today page (Needs you / Due soon / Activity / Pinned), light and dark themes.
- **Operations**: reminders and maintenance run in a scheduled in-process job, not on page render. Automatic daily backups, a backup before every migration, a health check, and performance budgets at household scale.
- A small **sample module** ("Household notes", type `notes-page`) used to prove the registry end-to-end; real modules ship in later phases.

### Roadmap (out of scope here, one change each)
- P1 Places pages + Inventory · P2 Maintenance + Projects · P3 Metrics (charts, CSV, push API) · P4 Restaurants · P5 API key UI polish, MCP server, MCP-ready docs.

## Capabilities

### New Capabilities
- `platform/auth`: accounts, sessions, sign-in rate limiting, admin user management, instance roles, API keys owned by users.
- `platform/entities`: shared household data, core entity record, extension tables, concurrent-edit protection, soft delete/archive/trash, module registry contract.
- `platform/service-api`: single operation contract, actor attribution, REST/OpenAPI, idempotent creates, input limits, error model.
- `platform/places`: place tree, subtree rollups, place assignment rules per module, property scope switcher, place deletion.
- `platform/collaboration`: notes and comments (rich text and Markdown), @mentions, multiple assignees.
- `platform/organization`: tags, typed entity links, external URLs, attachments.
- `platform/reminders`: date-based reminders on any entity, recipient resolution, scheduled processing, completion, personal due feed.
- `platform/activity`: activity log with diffs, undo, attention inbox and notification bell.
- `platform/search`: full-text search across entities, filters, and the command palette.
- `platform/app-shell`: layout, navigation, quick-create, Today page, themes, responsive behavior.
- `platform/operations`: backups, safe upgrades, health check, maintenance jobs, shutdown, performance at household scale.

### Modified Capabilities
- None (no existing specs).

## Impact

- Entire repo: new `package.json`, `app/`, `src/`, `drizzle/`, tests, CI.
- `docs/` (design docs, user guide, reference, operations), `DESIGN.md`, `PRODUCT.md` superseded; moved to `docs/legacy/` with a new short design index. `README.md` rewritten.
- `AGENTS.md` conventions update: Better Auth instead of Lucia, oRPC procedures, write pipeline rules, module registry, one household per instance.
- New runtime dependencies: oRPC, Better Auth + `@better-auth/api-key`, Tiptap + `@tiptap/markdown`, sharp. The scheduler adds no dependency.
- Deployment stays a single Node process with one SQLite file on local disk (no replicas, no network file systems). The `data/` directory now also holds `backups/`.
