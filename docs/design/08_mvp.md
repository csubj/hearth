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

| Deliverable                 | Notes                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `package.json` + pnpm       | Scripts: `dev`, `build`, `start`, `test`, `lint`, `typecheck`, `db:migrate`, `db:generate` |
| Next.js App Router skeleton | `app/layout.tsx`, `app/globals.css`                                                        |
| Tailwind v4                 | per `05_styling.md`                                                                        |
| Drizzle + better-sqlite3    | `src/db/`, `drizzle/` migrations                                                           |
| Vitest + ESLint + Prettier  | per `01_tech.md`                                                                           |
| Lefthook                    | wire existing `lefthook.yml`                                                               |
| `.env.example`              | `DATABASE_URL`, `SESSION_SECRET`, bootstrap vars                                           |
| Docker                      | `Dockerfile`, `docker-compose.yml` per `09_deploy.md`                                      |
| Health route                | `GET /api/health`                                                                          |

**Done when:**

- [ ] `pnpm install && pnpm dev` serves a placeholder page
- [ ] `pnpm test` runs (even if zero tests initially)
- [ ] `pnpm db:migrate` applies migrations on fresh DB
- [ ] `docker compose up` builds and responds on health check

---

## Phase 1 — Auth

**Goal:** login works; admin bootstrap; protected routes.

| Deliverable                             | Notes                                         |
| --------------------------------------- | --------------------------------------------- |
| `users`, `sessions` schema + migrations | `02_auth.md`, `03_schema.md`                  |
| Lucia setup                             | `src/lib/auth/`                               |
| `middleware.ts`                         | route protection                              |
| `/login` page                           | server action login                           |
| `pnpm run auth:bootstrap`               | first admin CLI                               |
| `(app)/layout.tsx`                      | minimal shell + logout                        |
| `/settings`                             | change own password                           |
| `/admin/users`                          | admin CRUD                                    |
| Auth tests                              | login, disabled user, admin guard, last-admin |

**Done when:**

- [ ] Bootstrap creates admin; login/logout works
- [ ] Unauthenticated users redirect to `/login`
- [ ] Admin can create member, reset password, disable user
- [ ] Non-admin cannot access `/admin/users`

---

## Phase 2 — Home + Stream

**Goal:** core product loop — capture and glance.

| Deliverable                | Notes                                    |
| -------------------------- | ---------------------------------------- |
| `stream_entries` migration |                                          |
| `/stream` page             | list + quick capture form                |
| `/` home                   | stream section summary                   |
| Server actions             | create, update, pin, mark done           |
| Basic UI components        | `Button`, list cards per `05_styling.md` |
| Notification emitter stub  | log-only OK; full fan-out in Phase 6     |

**Done when:**

- [ ] Authenticated user adds stream note from `/stream`
- [ ] Pin and mark-done persist
- [ ] Home shows recent/pinned stream items
- [ ] Integration test: create entry visible on home

---

## Phase 3 — Restaurants

**Goal:** first specialized list feature.

| Deliverable                         | Notes                                |
| ----------------------------------- | ------------------------------------ |
| `restaurants` migration             |                                      |
| `/restaurants`, `/restaurants/[id]` | list + detail                        |
| Actions                             | create, update, mark visited, rating |
| Home section                        | want-to-try preview                  |
| Filters                             | status, sort by date/rating          |

**Done when:**

- [ ] CRUD restaurant end-to-end
- [ ] Mark visited with 1–5 stars and visit note
- [ ] List filters work
- [ ] No map (deferred)

---

## Phase 4 — Projects, Events, Metrics

**Goal:** remaining feature lists (metrics without charting yet).

| Deliverable                                         | Notes                      |
| --------------------------------------------------- | -------------------------- |
| `projects`, `metrics`, `metric_entries`, `events` migrations |                            |
| Routes per `04_routes.md`                           | all list + detail pages    |
| Home sections                                       | one block per feature      |
| Metric history                                      | table/cards on detail page |

**Done when:**

- [ ] Each feature: create, view list, view detail, update
- [ ] Metric accepts dated entries with value + note
- [ ] Events sort by `starts_at`; past events visible on full page
- [ ] Home summarizes all feature areas (through metrics + events)

---

## Phase 5 — Attachments

**Goal:** photos on user content.

| Deliverable                 | Notes                                             |
| --------------------------- | ------------------------------------------------- |
| `attachments` migration     |                                                   |
| `POST/GET /api/attachments` | per `07_attachments.md`                           |
| Upload UI on detail forms   | stream, restaurant, project, metric entry, event  |
| Thumbnail grid + lightbox   | Radix Dialog                                      |

**Done when:**

- [ ] Upload jpeg on restaurant detail; image displays after refresh
- [ ] Unauthenticated GET returns 401
- [ ] 10 MB / mime validation enforced

---

## Phase 6 — Notifications & @-mentions

**Goal:** activity stream and mentions.

| Deliverable                            | Notes                       |
| -------------------------------------- | --------------------------- |
| `notifications`, `mentions` migrations |                             |
| `src/lib/notifications/emit.ts`        | full fan-out                |
| `src/lib/mentions/parse.ts`            | parse + persist             |
| `/notifications` page                  | feed, mark read, mark all   |
| Nav badge                              | unread count                |
| @ autocomplete                         | Popover on supported fields |
| Home "since last visit"                | optional block              |
| Wire emitter into all actions          | from Phase 2–5              |

**Done when:**

- [ ] User A creates stream note → User B sees notification
- [ ] `@username` in note → mentioned user gets `mention` notification
- [ ] Mark all read clears badge
- [ ] Parser tests pass

---

## Phase 7 — Polish & deploy-ready

**Goal:** production-like local run and CI green.

| Deliverable                       | Notes                         |
| --------------------------------- | ----------------------------- |
| Error boundaries / toast feedback | minimal                       |
| Loading states on forms           | `useActionState` where needed |
| README                            | setup instructions            |
| CI workflow                       | per `10_ci.md`                |
| Docker production smoke test      | compose + health + login      |

**Done when:**

- [ ] `pnpm build` succeeds
- [ ] CI passes on clean clone
- [ ] Fresh deploy: bootstrap → login → add stream note works in Docker

---

## Phase 8 — Configurable auth & API tokens

**Goal:** optional open web mode and programmatic REST access.

| Deliverable                              | Notes                                    |
| ---------------------------------------- | ---------------------------------------- |
| `AUTH_MODE`, `OPEN_MODE_USERNAME` env    | per `02_auth.md`                         |
| Middleware open-mode branch              | shared identity attribution              |
| `api_tokens` migration + admin UI        | `/admin/api-tokens`                      |
| `pnpm run auth:create-token` CLI         | non-interactive token creation           |
| `/api/v1/*` REST handlers                | all resources per `04_routes.md`         |
| Zod schemas + OpenAPI registry           | `@asteasolutions/zod-to-openapi`         |
| `GET /api/openapi.json`, `/api/docs`     | Scalar or Redoc UI                       |
| Bearer auth middleware for `/api/v1/*`   | always required                          |

**Done when:**

- [ ] `AUTH_MODE=open` skips login gate; writes attributed to `OPEN_MODE_USERNAME`
- [ ] Admin routes still require logged-in admin in open mode
- [ ] Create token → curl `/api/v1/stream` with bearer header succeeds
- [ ] Revoked token returns 401
- [ ] `/api/openapi.json` validates; `/api/docs` renders

---

## Phase 9 — Metrics graphing & existing-data-first layout

**Goal:** charts for metrics and UX shift to content-first pages.

| Deliverable                              | Notes                                    |
| ---------------------------------------- | ---------------------------------------- |
| Recharts `MetricChart` component         | per `05_styling.md`                      |
| Chart on `/metrics/[id]`                 | numeric values only                      |
| Compact create pattern                   | header button / Collapsible on list pages |
| Refactor list pages                      | existing content leads, capture secondary |

**Done when:**

- [ ] Numeric metric shows line chart on detail page
- [ ] Text metric falls back to entry list (no chart)
- [ ] List pages lead with existing items, not create form
- [ ] Home metrics section unchanged (latest entry per metric)

---

## Phase 10 — Inventory

**Goal:** searchable household catalog with import/export.

| Deliverable                                         | Notes                                    |
| --------------------------------------------------- | ---------------------------------------- |
| `inventory_*` migrations                            | per `03_schema.md`                       |
| `/inventory`, `/inventory/[id]` routes            | search, tags, links                      |
| Document attachments for inventory                  | PDF per `07_attachments.md`              |
| `inventory.created` / `inventory.updated` notifications | per `06_notifications.md`            |
| `POST /api/inventory/import`, `GET /api/inventory/export` | bulk ops                           |
| `/api/v1/inventory` + types + tags REST             | per `04_routes.md`                       |
| Home inventory section                              | recent items preview                     |

**Done when:**

- [ ] Create item with tags, links, photo, and PDF manual
- [ ] Search by name/model/serial/location works
- [ ] Export → import round-trip preserves items
- [ ] API token can CRUD inventory via `/api/v1/inventory`

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
      name: projects_events_metrics
      depends_on: [3]
    - id: 5
      name: attachments
      depends_on: [4]
    - id: 6
      name: notifications_mentions
      depends_on: [4]
    - id: 7
      name: polish_deploy
      depends_on: [5, 6]
    - id: 8
      name: configurable_auth_api_tokens
      depends_on: [7]
    - id: 9
      name: metrics_graphing_ux
      depends_on: [8]
    - id: 10
      name: inventory
      depends_on: [9]
  v1_excludes:
    - google_maps
    - push_notifications
    - dark_mode
    - oauth
    - scoped_api_tokens
```

---

## Agent instructions

When asked to "build hearth" or "implement phase N":

1. Read `docs/design/README.md` for doc order
2. Confirm current phase from repo state (what exists in `app/`, `src/db/schema/`)
3. Implement only that phase's deliverables
4. Run `pnpm test`, `pnpm typecheck`, `pnpm lint` before marking complete
5. Do not skip auth (Phase 1) before feature work
