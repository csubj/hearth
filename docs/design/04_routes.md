---
doc: routes
project: hearth
version: 2
status: decided
last_updated: 2026-06-16
related:
  - docs/design/01_tech.md
  - docs/design/02_auth.md
  - docs/design/03_schema.md
---

# App Structure & Routes

Structured reference for agents and contributors. Maps product features to Next.js App Router files, server actions, and API routes.

**Conventions:**

- App Router under `app/` (no `pages/`)
- Prefer **Server Components** and **server actions** for web UI mutations
- Use **`app/api/v1/`** for the versioned REST API (bearer token auth)
- Use **`app/api/`** for OpenAPI spec, interactive docs, uploads, health, and inventory import/export
- Shared logic in `src/lib/`; DB in `src/db/`; UI in `src/components/`

---

## Repository layout

```
hearth/
├── app/
│   ├── layout.tsx              # root html/body, fonts, globals
│   ├── globals.css
│   ├── login/
│   │   └── page.tsx            # public login form
│   ├── (app)/                  # authenticated route group
│   │   ├── layout.tsx          # app shell: nav, user menu
│   │   ├── page.tsx            # home / glanceable summary
│   │   ├── browse/
│   │   │   └── page.tsx        # hub for feature areas
│   │   ├── reminders/
│   │   │   └── page.tsx        # upcoming maintenance + metric reminders
│   │   ├── restaurants/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── projects/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── metrics/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── inventory/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── notifications/
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx        # change own password
│   │   └── admin/
│   │       ├── layout.tsx      # admin guard
│   │       ├── users/
│   │       │   └── page.tsx
│   │       └── api-tokens/
│   │           └── page.tsx
│   └── api/
│       ├── v1/                 # REST API (bearer token)
│       │   ├── restaurants/
│       │   ├── projects/
│       │   ├── metrics/
│       │   └── inventory/
│       ├── openapi.json/
│       │   └── route.ts        # GET OpenAPI spec
│       ├── docs/
│       │   └── page.tsx        # Scalar/Redoc interactive docs
│       ├── attachments/
│       │   ├── route.ts        # POST upload
│       │   └── [id]/route.ts   # GET file bytes
│       ├── inventory/
│       │   ├── import/route.ts # POST bulk import
│       │   └── export/route.ts # GET bulk export
│       └── health/
│           └── route.ts        # GET liveness for deploy
├── src/
│   ├── components/             # shared UI (see 05_styling.md)
│   ├── db/                     # drizzle schema + client
│   └── lib/
│       ├── auth/               # lucia, session helpers, middleware utils
│       ├── api/                # REST handlers, Zod schemas, OpenAPI registry
│       ├── actions/            # server actions by domain
│       ├── notifications/      # emit + fan-out helpers
│       ├── mentions/           # parse + persist @-mentions
│       └── attachments/        # save + resolve paths
├── scripts/
│   ├── auth-bootstrap.ts       # pnpm run auth:bootstrap
│   └── auth-create-token.ts    # pnpm run auth:create-token
├── drizzle/                    # SQL migrations (committed)
├── data/                       # gitignored: hearth.db, uploads/
├── middleware.ts               # session check, redirects, open mode
└── docs/design/
```

Route group `(app)` does not affect URLs — `/stream` not `/app/stream`.

---

## Route table

### Web UI

| Path                        | Access | Purpose                                      |
| --------------------------- | ------ | -------------------------------------------- |
| `/login`                    | public | Login form; redirect to `/` if session valid |
| `/`                         | auth\* | Home dashboard — stats, reminders, feature previews |
| `/browse`                   | auth\* | Hub for Projects, Restaurants, Metrics, Inventory |
| `/reminders`                | auth\* | Upcoming maintenance and metric reminders         |
| `/restaurants`              | auth\* | Restaurant list (v1: no map)                 |
| `/restaurants/[id]`         | auth\* | Detail, mark visited, rating, notes          |
| `/projects`                 | auth\* | Project list                                 |
| `/projects/[id]`            | auth\* | Project detail + status updates              |
| `/metrics`                  | auth\* | Metric list + chart links                    |
| `/metrics/[id]`             | auth\* | Entry history, chart, add entry              |
| `/inventory`                | auth\* | Searchable inventory list                    |
| `/inventory/[id]`           | auth\* | Item detail — tags, links, files, notes      |
| `/notifications`            | auth\* | Per-user activity stream                     |
| `/settings`                 | auth\* | Change own password; choose theme            |
| `/admin/users`              | admin  | User CRUD                                    |
| `/admin/api-tokens`         | admin  | API token create/revoke                      |

\*In `open` mode (`AUTH_MODE=open`), app pages skip the login gate and attribute writes to `OPEN_MODE_USERNAME`. Admin routes still require a logged-in admin.

Unauthenticated access to protected routes in `required` mode → redirect `/login?returnTo=...`. Non-admin access to `/admin/*` → redirect `/` with error toast or 403 page.

### API (non-versioned)

| Path                        | Access | Purpose                                      |
| --------------------------- | ------ | -------------------------------------------- |
| `GET /api/openapi.json`     | public | OpenAPI 3.x spec                             |
| `/api/docs`                 | public | Interactive API docs (Scalar/Redoc)          |
| `POST /api/attachments`     | auth   | Multipart upload                             |
| `GET /api/attachments/[id]` | auth   | Serve file (check session or token)          |
| `POST /api/inventory/import`| auth   | Bulk inventory import                        |
| `GET /api/inventory/export` | auth   | Bulk inventory export                        |
| `GET /api/health`           | public | `{ ok: true }` for probes                    |

### REST API (`/api/v1/*`)

All routes require `Authorization: Bearer <token>`. See `docs/reference/api.md`.

| Resource            | Base path                         | Operations        |
| ------------------- | --------------------------------- | ----------------- |
| Restaurants         | `/api/v1/restaurants`             | list, CRUD        |
| Projects            | `/api/v1/projects`                | list, CRUD        |
| Project components  | `/api/v1/projects/{id}/components` | list, create, update, delete |
| Metrics             | `/api/v1/metrics`                 | list, CRUD        |
| Metric entries      | `/api/v1/metrics/{id}/entries`    | list, create, update, delete |
| Inventory           | `/api/v1/inventory`               | list, CRUD, search |
| Inventory maintenance reminders | `/api/v1/inventory/{id}/maintenance-reminders` | list, CRUD, complete |
| Inventory types     | `/api/v1/inventory/types`         | list, CRUD        |
| Inventory tags      | `/api/v1/inventory/tags`          | list, CRUD        |

REST handlers validate with Zod, write via Drizzle, and call the notification emitter. OpenAPI paths are registered from the same schemas.

---

## Layouts

### Root `app/layout.tsx`

- HTML shell, global CSS, font loading
- No auth check (login page uses this)

### `app/(app)/layout.tsx`

- Validates session in `required` mode (or resolves `OPEN_MODE_USERNAME` in `open` mode)
- Renders: top nav (Home, Browse dropdown, Reminders, Notifications bell)
- Browse dropdown links to `/browse`, `/projects`, `/restaurants`, `/metrics`, `/inventory`
- Mobile nav: Home, Browse (`/browse`), Reminders
- User menu: display name, Settings, Logout; Admin link if `role === admin`
- Updates `users.last_seen_at` on load (for "since you last visited")

### `app/(app)/admin/layout.tsx`

- Requires `role === admin` (real session — never skipped in open mode)
- Sub-nav for admin sections: Users, API tokens

---

## Middleware

`middleware.ts` at repo root:

| Matcher                              | Behavior                                            |
| ------------------------------------ | --------------------------------------------------- |
| `/login`                             | If session valid → redirect `/`                     |
| `/(app)/*`                           | `required`: no session → `/login?returnTo=...`; `open`: pass through |
| `/admin/*`                           | No session → `/login?returnTo=...` (always)         |
| `/api/v1/*`                          | Skip — bearer auth in route handler                   |
| `/api/attachments/*`                 | Session or bearer token                             |
| Static assets, `/_next/*`            | Skip                                                |

Use Lucia session validation helper from `src/lib/auth/session.ts`. Keep middleware edge-compatible — defer DB-heavy work to layouts if needed (Lucia often validates in Node runtime).

---

## Server actions

Colocate in `src/lib/actions/` by domain. Each action:

1. Validates session via `requireUser()` or `requireAdmin()` (open mode resolves shared identity)
2. Validates input (zod schemas in same file or `src/lib/validations/`)
3. Writes to DB via Drizzle
4. Calls notification emitter when appropriate
5. Calls `revalidatePath()` for affected routes

| File               | Actions                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| `auth.ts`          | `login`, `logout`, `changePassword`                                        |
| `settings.ts`      | `updateTheme`                                                              |
| `restaurants.ts`   | `create`, `update`, `markVisited`, `setRating`                             |
| `projects.ts`      | `create`, `updateTitle`, `updateNotes`, `setStatus`, `setPriority`, `setTags`, link/component CRUD, `deleteProject` |
| `metrics.ts`       | `createMetric`, `addEntry`, `updateMetric`                                 |
| `inventory.ts`     | `create`, `update`, `addLink`, `removeLink`, `setTags`                     |
| `inventory-maintenance.ts` | `createMaintenanceReminder`, `updateMaintenanceReminder`, `deleteMaintenanceReminder`, `completeMaintenanceReminder`, link CRUD |
| `notifications.ts` | `markRead`, `markAllRead`                                                  |
| `admin/users.ts`   | `createUser`, `resetPassword`, `disableUser`, `enableUser`, `promoteAdmin` |
| `admin/api-tokens.ts` | `createToken`, `revokeToken`                                            |

Forms use `<form action={...}>` or `useActionState` in client wrappers where UX needs pending states.

---

## API routes

### Upload & serve (binary)

| Route                   | Method | Body                                                    | Response                        |
| ----------------------- | ------ | ------------------------------------------------------- | ------------------------------- |
| `/api/attachments`      | POST   | `multipart/form-data`: `file`, `entityType`, `entityId` | `{ id, url }`                   |
| `/api/attachments/[id]` | GET    | —                                                       | file stream with `Content-Type` |

### Inventory bulk

| Route                    | Method | Body              | Response              |
| ------------------------ | ------ | ----------------- | --------------------- |
| `/api/inventory/import`  | POST   | JSON or CSV file  | `{ imported: n }`     |
| `/api/inventory/export`  | GET    | —                 | JSON export file      |

### OpenAPI

| Route                   | Method | Response                        |
| ----------------------- | ------ | ------------------------------- |
| `/api/openapi.json`     | GET    | OpenAPI 3.x JSON                |
| `/api/docs`             | GET    | HTML interactive docs UI        |

### Health

| Route           | Method | Response           |
| --------------- | ------ | ------------------ |
| `/api/health`   | GET    | `{ ok: true }`     |

The web UI uses server actions for mutations. REST under `/api/v1/*` is an **additional** programmatic surface — same validation rules, same data.

---

## Navigation & home page data

Home `app/(app)/page.tsx` fetches parallel summaries:

```yaml
home_sections:
  stats_strip:
    query: active projects, want-to-try restaurants, stale metrics, inventory due, reminders due
  reminders:
    query: upcoming inventory maintenance + metric reminders within 14 days, limit 5
  restaurants:
    query: status=want_to_try, limit 5
  projects:
    query: status=in_progress OR recently updated, limit 5
  metrics:
    query: each metric latest entry; flag if stale (configurable threshold)
  inventory:
    query: items with overdue maintenance first, then recently updated, limit 5
  notifications:
    query: unread count since last_seen_at for badge
  since_last_visit:
    query: notifications created after previous last_seen_at, limit 3
```

`/reminders` shows the full upcoming feed grouped as Overdue and Due soon. `/browse` links to each feature area with counts.

---

## Auth routes (detail)

Login page posts to `login` server action — not a separate API route. Logout via form POST to `logout` action.

Bootstrap is CLI-only (`scripts/auth-bootstrap.ts`), not a web route. API token creation also available via CLI (`scripts/auth-create-token.ts`).

---

## File naming

| Kind                 | Pattern              | Example                              |
| -------------------- | -------------------- | ------------------------------------ |
| Page                 | `page.tsx`           | `app/(app)/restaurants/page.tsx`     |
| Layout               | `layout.tsx`         | `app/(app)/layout.tsx`               |
| REST handler         | `route.ts`           | `app/api/v1/restaurants/route.ts`    |
| Server action module | kebab or domain name | `src/lib/actions/restaurants.ts`     |
| Component            | PascalCase file      | `src/components/settings/ThemePicker.tsx` |
| Test                 | co-located           | `src/lib/mentions/parse.test.ts`     |

---

## Routes summary (machine-readable)

```yaml
routes:
  router: nextjs-app
  route_group_auth: (app)
  public: [/login, /api/health, /api/openapi.json, /api/docs]
  authenticated:
    - /
    - /browse
    - /reminders
    - /restaurants
    - /restaurants/[id]
    - /projects
    - /projects/[id]
    - /metrics
    - /metrics/[id]
    - /inventory
    - /inventory/[id]
    - /notifications
    - /settings
  admin: [/admin/users, /admin/api-tokens]
  api:
    rest: /api/v1/*
    openapi: GET /api/openapi.json
    docs: /api/docs
    upload: POST /api/attachments
    serve: GET /api/attachments/[id]
    inventory_import: POST /api/inventory/import
    inventory_export: GET /api/inventory/export
  mutations:
    web: server_actions
    programmatic: rest_api_v1
  middleware: middleware.ts
  auth_modes: docs/design/02_auth.md
```
