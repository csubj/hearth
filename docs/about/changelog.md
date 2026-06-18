# Changelog

All notable changes to hearth. Versioning follows [Semantic Versioning](https://semver.org/) for tagged releases.

## Unreleased

### Removed

- **Events** — calendar-dated items feature removed; use stream notes for date-specific reminders

Documentation and design updates for upcoming features (implementation in progress):

### Added (documented)

- **REST API** — `/api/v1/*` programmatic access with bearer token auth
- **OpenAPI** — self-describing spec at `/api/openapi.json` and interactive docs at `/api/docs`
- **API tokens** — admin-managed bearer tokens (`api_tokens` table)
- **Configurable auth** — `AUTH_MODE=required|open` with `OPEN_MODE_USERNAME` for trusted networks
- **Metrics** — renamed from Trackers; line charts for numeric values (Recharts)
- **Inventory** — searchable household catalog with tags, links, photos, PDF documents, import/export
- **Existing-data-first layout** — list pages lead with content; compact create in header

### Changed (documented)

- Trackers renamed to **Metrics** across schema, routes, and UI (`/metrics`)
- Attachments generalized — inventory accepts PDF documents; other entities remain images-only
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
