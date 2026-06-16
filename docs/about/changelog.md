# Changelog

All notable changes to hearth. Versioning follows [Semantic Versioning](https://semver.org/) for tagged releases.

## v1.0.0 — 2026-06

Initial release. MVP phases 0–7 complete.

### Added

- **Authentication** — username/password login, Lucia sessions, admin bootstrap CLI, user management
- **Home page** — glanceable summary across all feature areas
- **Stream** — quick-capture notes with pin, done, rough when, @-mentions
- **Restaurants** — wishlist, visit status, 1–5 star ratings, visit notes
- **Projects** — idea / in progress / done statuses
- **Trackers** — named trackers with dated entries
- **Events** — date-ordered calendar items
- **Attachments** — photo upload on stream, restaurants, projects, trackers, events
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

## Unreleased

Changes on `main` after the latest tag appear here until the next release.

---

For design-phase history, see [MVP Phases](../design/08_mvp.md).
