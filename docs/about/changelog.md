# Changelog

All notable changes to hearth. Versioning follows [Semantic Versioning](https://semver.org/) for tagged releases.

## Unreleased

### Removed

- **Stream** — quick-capture notes removed; use Projects quick capture and notes instead. Run `tsx scripts/purge-stream.ts` before migrating if upgrading from a version with Stream data.
- **Events** — calendar-dated items feature removed

### Added

- **Home Log** — `/home-log` property/room/space hierarchy with typed items (paint swatches, appliances, electrical, plumbing, flooring, fixtures, window treatments, generic), cross-links to maintenance/inventory/projects with back-links on all sides, attachments, Markdown notes with @-mentions, and REST API (`/api/v1/home/spaces`, `/api/v1/home/items`)
- **House maintenance logs** — `/maintenance` tracks work with metadata, follow-up reminders (interval + one-time), tags, links, related projects/inventory, and attachments
- **Home dashboard** — stats strip, upcoming reminders preview, and denser feature section cards
- **Browse hub** — `/browse` groups Projects, Restaurants, Metrics, and Inventory; desktop nav uses a Browse dropdown
- **Reminders feed** — `/reminders` lists overdue and due-soon inventory maintenance and metric logging reminders
- **Inventory maintenance reminders** — per-item recurring upkeep with title, notes, links, interval, and household or per-user notification scope
- **Metric reminder scope** — optional `reminderRecipientUserId` to notify one member instead of the whole household
- **REST API** — `/api/v1/*` programmatic access with bearer token auth
- **OpenAPI** — self-describing spec at `/api/openapi.json` and interactive docs at `/api/docs`
- **API tokens** — admin-managed bearer tokens (`api_tokens` table), created in `/admin/api-tokens` or via `pnpm run auth:create-token`
- **Configurable auth** — `AUTH_MODE=required|open` with `OPEN_MODE_USERNAME` for trusted networks
- **Metrics** — line charts for numeric values (Recharts)
- **Inventory** — searchable household catalog with tags, links, photos, PDF documents, import/export
- **Appearance themes** — per-user color themes (Default, Warm Earth, Dark, Gamer) in **Settings → Appearance**
- **Existing-data-first layout** — list pages lead with content; compact create in header

### Changed

- **Projects v2** — auto-saving markdown notes (field renamed from `description` to `notes` in REST API), priority, tags, links, component/budget cost rollup, PDF attachments
- **REST breaking:** `POST/PATCH /api/v1/projects` use `notes` instead of `description`; `/api/v1/stream` removed
- Trackers renamed to **Metrics** across schema, routes, and UI (`/metrics`)
- Attachments generalized — inventory items and projects accept PDF documents; other entities remain images-only
- MVP phases extended to 0–10 (auth modes, API, graphing, inventory)

## v1.0.0 — 2026-06

Initial release. MVP phases 0–7 complete.

### Added

- **Authentication** — username/password login, Lucia sessions, admin bootstrap CLI, user management
- **Home page** — glanceable summary across all feature areas
- **Stream** — quick-capture notes with pin, done, rough when, @-mentions
- **Restaurants** — wishlist, visit status, 1–5 star ratings, visit notes
- **Projects** — idea / in progress / done statuses
- **Metrics** — named metrics with dated entries (formerly Trackers)
- **Attachments** — photo upload on stream, restaurants, projects, metrics
- **Notifications** — in-app activity feed, @-mention delivery, unread badge
- **Docker** — multi-stage Dockerfile, Compose, GHCR image publishing
- **CI** — GitHub Actions lint, format, typecheck, test
- **Documentation** — MkDocs site with user guide, operating guide, architecture docs

### Stack

- Next.js 15 (App Router), React 19, TypeScript
- SQLite + Drizzle ORM
- Tailwind CSS v4, Radix UI
- Lucia v3 + Argon2id
- Vitest, ESLint, Prettier, Lefthook

---

For design-phase history, see [MVP Phases](../design/08_mvp.md).
