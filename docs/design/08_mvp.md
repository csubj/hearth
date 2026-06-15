---
doc: mvp
project: hearth
version: 1
status: decided
last_updated: 2026-06-14
related:
  - docs/design/00_init.md
  - docs/design/03_schema.md
  - docs/design/04_routes.md
---

# MVP Build Phases

Structured reference for agents and contributors. Defines implementation order, scope per phase, and acceptance criteria.

**Rule:** complete each phase before starting the next. Each phase ends with a runnable app and passing tests for its scope.

---

## Phase 0 — Scaffold & toolchain

**Goal:** empty app boots, DB migrates, hooks run.

| Deliverable | Notes |
|-------------|-------|
| `package.json` + pnpm | Scripts: `dev`, `build`, `start`, `test`, `lint`, `typecheck`, `db:migrate`, `db:generate` |
| Next.js App Router skeleton | `app/layout.tsx`, `app/globals.css` |
| Tailwind v4 | per `05_styling.md` |
| Drizzle + better-sqlite3 | `src/db/`, `drizzle/` migrations |
| Vitest + ESLint + Prettier | per `01_tech.md` |
| Lefthook | wire existing `lefthook.yml` |
| `.env.example` | `DATABASE_URL`, `SESSION_SECRET`, bootstrap vars |
| Docker | `Dockerfile`, `docker-compose.yml` per `09_deploy.md` |
| Health route | `GET /api/health` |

**Done when:**

- [ ] `pnpm install && pnpm dev` serves a placeholder page
- [ ] `pnpm test` runs (even if zero tests initially)
- [ ] `pnpm db:migrate` applies migrations on fresh DB
- [ ] `docker compose up` builds and responds on health check

---

## Phase 1 — Auth

**Goal:** login works; admin bootstrap; protected routes.

| Deliverable | Notes |
|-------------|-------|
| `users`, `sessions` schema + migrations | `02_auth.md`, `03_schema.md` |
| Lucia setup | `src/lib/auth/` |
| `middleware.ts` | route protection |
| `/login` page | server action login |
| `pnpm run auth:bootstrap` | first admin CLI |
| `(app)/layout.tsx` | minimal shell + logout |
| `/settings` | change own password |
| `/admin/users` | admin CRUD |
| Auth tests | login, disabled user, admin guard, last-admin |

**Done when:**

- [ ] Bootstrap creates admin; login/logout works
- [ ] Unauthenticated users redirect to `/login`
- [ ] Admin can create member, reset password, disable user
- [ ] Non-admin cannot access `/admin/users`

---

## Phase 2 — Home + Stream

**Goal:** core product loop — capture and glance.

| Deliverable | Notes |
|-------------|-------|
| `stream_entries` migration | |
| `/stream` page | list + quick capture form |
| `/` home | stream section summary |
| Server actions | create, update, pin, mark done |
| Basic UI components | `Button`, list cards per `05_styling.md` |
| Notification emitter stub | log-only OK; full fan-out in Phase 6 |

**Done when:**

- [ ] Authenticated user adds stream note from `/stream`
- [ ] Pin and mark-done persist
- [ ] Home shows recent/pinned stream items
- [ ] Integration test: create entry visible on home

---

## Phase 3 — Restaurants

**Goal:** first specialized list feature.

| Deliverable | Notes |
|-------------|-------|
| `restaurants` migration | |
| `/restaurants`, `/restaurants/[id]` | list + detail |
| Actions | create, update, mark visited, rating |
| Home section | want-to-try preview |
| Filters | status, sort by date/rating |

**Done when:**

- [ ] CRUD restaurant end-to-end
- [ ] Mark visited with 1–5 stars and visit note
- [ ] List filters work
- [ ] No map (deferred)

---

## Phase 4 — Projects, Events, Trackers

**Goal:** remaining feature lists.

| Deliverable | Notes |
|-------------|-------|
| `projects`, `trackers`, `tracker_entries`, `events` migrations | |
| Routes per `04_routes.md` | all list + detail pages |
| Home sections | one block per feature |
| Tracker history | table/cards on detail page |

**Done when:**

- [ ] Each feature: create, view list, view detail, update
- [ ] Tracker accepts dated entries with value + note
- [ ] Events sort by `starts_at`; past events visible on full page
- [ ] Home summarizes all five feature areas

---

## Phase 5 — Attachments

**Goal:** photos on user content.

| Deliverable | Notes |
|-------------|-------|
| `attachments` migration | |
| `POST/GET /api/attachments` | per `07_attachments.md` |
| Upload UI on detail forms | stream, restaurant, project, tracker entry, event |
| Thumbnail grid + lightbox | Radix Dialog |

**Done when:**

- [ ] Upload jpeg on restaurant detail; image displays after refresh
- [ ] Unauthenticated GET returns 401
- [ ] 10 MB / mime validation enforced

---

## Phase 6 — Notifications & @-mentions

**Goal:** activity stream and mentions.

| Deliverable | Notes |
|-------------|-------|
| `notifications`, `mentions` migrations | |
| `src/lib/notifications/emit.ts` | full fan-out |
| `src/lib/mentions/parse.ts` | parse + persist |
| `/notifications` page | feed, mark read, mark all |
| Nav badge | unread count |
| @ autocomplete | Popover on supported fields |
| Home "since last visit" | optional block |
| Wire emitter into all actions | from Phase 2–5 |

**Done when:**

- [ ] User A creates stream note → User B sees notification
- [ ] `@username` in note → mentioned user gets `mention` notification
- [ ] Mark all read clears badge
- [ ] Parser tests pass

---

## Phase 7 — Polish & deploy-ready

**Goal:** production-like local run and CI green.

| Deliverable | Notes |
|-------------|-------|
| Error boundaries / toast feedback | minimal |
| Loading states on forms | `useActionState` where needed |
| README | setup instructions |
| CI workflow | per `10_ci.md` |
| Docker production smoke test | compose + health + login |

**Done when:**

- [ ] `pnpm build` succeeds
- [ ] CI passes on clean clone
- [ ] Fresh deploy: bootstrap → login → add stream note works in Docker

---

## Phase map (machine-readable)

```yaml
mvp:
  phases:
    - id: 0
      name: scaffold
      blocks: [auth, features, attachments, notifications]
    - id: 1
      name: auth
      depends_on: [0]
    - id: 2
      name: home_stream
      depends_on: [1]
    - id: 3
      name: restaurants
      depends_on: [2]
    - id: 4
      name: projects_events_trackers
      depends_on: [3]
    - id: 5
      name: attachments
      depends_on: [4]
    - id: 6
      name: notifications_mentions
      depends_on: [4]  # can parallel with 5 if needed
    - id: 7
      name: polish_deploy
      depends_on: [5, 6]
  v1_excludes:
    - google_maps
    - push_notifications
    - dark_mode
    - oauth
```

---

## Agent instructions

When asked to "build hearth" or "implement phase N":

1. Read `docs/design/README.md` for doc order
2. Confirm current phase from repo state (what exists in `app/`, `src/db/schema/`)
3. Implement only that phase's deliverables
4. Run `pnpm test`, `pnpm typecheck`, `pnpm lint` before marking complete
5. Do not skip auth (Phase 1) before feature work
