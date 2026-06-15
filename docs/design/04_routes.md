---
doc: routes
project: hearth
version: 1
status: decided
last_updated: 2026-06-14
related:
  - docs/design/01_tech.md
  - docs/design/02_auth.md
  - docs/design/03_schema.md
---

# App Structure & Routes

Structured reference for agents and contributors. Maps product features to Next.js App Router files, server actions, and API routes.

**Conventions:**

- App Router under `app/` (no `pages/`)
- Prefer **Server Components** and **server actions** for mutations
- Use **`app/api/`** only for file uploads and attachment serving (streaming/binary)
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
│   │   ├── stream/
│   │   │   └── page.tsx
│   │   ├── restaurants/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── projects/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── trackers/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── events/
│   │   │   └── page.tsx
│   │   ├── notifications/
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx        # change own password
│   │   └── admin/
│   │       ├── layout.tsx      # admin guard
│   │       └── users/
│   │           └── page.tsx
│   └── api/
│       ├── attachments/
│       │   ├── route.ts        # POST upload
│       │   └── [id]/route.ts   # GET file bytes
│       └── health/
│           └── route.ts        # GET liveness for deploy
├── src/
│   ├── components/             # shared UI (see 05_styling.md)
│   ├── db/                     # drizzle schema + client
│   └── lib/
│       ├── auth/               # lucia, session helpers, middleware utils
│       ├── actions/            # server actions by domain
│       ├── notifications/      # emit + fan-out helpers
│       ├── mentions/             # parse + persist @-mentions
│       └── attachments/        # save + resolve paths
├── scripts/
│   └── auth-bootstrap.ts       # pnpm run auth:bootstrap
├── drizzle/                    # SQL migrations (committed)
├── data/                       # gitignored: hearth.db, uploads/
├── middleware.ts               # session check, redirects
└── docs/design/
```

Route group `(app)` does not affect URLs — `/stream` not `/app/stream`.

---

## Route table

| Path | Access | Purpose |
|------|--------|---------|
| `/login` | public | Login form; redirect to `/` if session valid |
| `/` | auth | Home summary (all feature sections) |
| `/stream` | auth | Full stream list + quick capture |
| `/restaurants` | auth | Restaurant list (v1: no map) |
| `/restaurants/[id]` | auth | Detail, mark visited, rating, notes |
| `/projects` | auth | Project list |
| `/projects/[id]` | auth | Project detail + status updates |
| `/trackers` | auth | Tracker list |
| `/trackers/[id]` | auth | Entry history + add entry |
| `/events` | auth | Upcoming + past events |
| `/notifications` | auth | Per-user activity stream |
| `/settings` | auth | Change own password |
| `/admin/users` | admin | User CRUD |
| `POST /api/attachments` | auth | Multipart upload |
| `GET /api/attachments/[id]` | auth | Serve file (check session) |
| `GET /api/health` | public | `{ ok: true }` for probes |

Unauthenticated access to `(app)/*` or `/admin/*` → redirect `/login?returnTo=...`.

Non-admin access to `/admin/*` → redirect `/` with error toast or 403 page.

---

## Layouts

### Root `app/layout.tsx`

- HTML shell, global CSS, font loading
- No auth check (login page uses this)

### `app/(app)/layout.tsx`

- Validates session (or relies on middleware)
- Renders: top nav (Home, Stream, Restaurants, Projects, Trackers, Events, Notifications bell)
- User menu: display name, Settings, Logout; Admin link if `role === admin`
- Updates `users.last_seen_at` on load (for "since you last visited")

### `app/(app)/admin/layout.tsx`

- Requires `role === admin`
- Sub-nav for admin sections (v1: Users only)

---

## Middleware

`middleware.ts` at repo root:

| Matcher | Behavior |
|---------|----------|
| `/login` | If session valid → redirect `/` |
| `/(app)/*`, `/admin/*` | If no session → redirect `/login?returnTo=pathname` |
| `/api/attachments/*` (except health) | Session required |
| Static assets, `/_next/*` | Skip |

Use Lucia session validation helper from `src/lib/auth/session.ts`. Keep middleware edge-compatible — defer DB-heavy work to layouts if needed (Lucia often validates in Node runtime).

---

## Server actions

Colocate in `src/lib/actions/` by domain. Each action:

1. Validates session via `requireUser()` or `requireAdmin()`
2. Validates input (zod schemas in same file or `src/lib/validations/`)
3. Writes to DB via Drizzle
4. Calls notification emitter when appropriate
5. Calls `revalidatePath()` for affected routes

| File | Actions |
|------|---------|
| `auth.ts` | `login`, `logout`, `changePassword` |
| `stream.ts` | `createEntry`, `updateEntry`, `togglePin`, `markDone` |
| `restaurants.ts` | `create`, `update`, `markVisited`, `setRating` |
| `projects.ts` | `create`, `update`, `setStatus` |
| `trackers.ts` | `createTracker`, `addEntry`, `updateTracker` |
| `events.ts` | `create`, `update`, `delete` |
| `notifications.ts` | `markRead`, `markAllRead` |
| `admin/users.ts` | `createUser`, `resetPassword`, `disableUser`, `enableUser`, `promoteAdmin` |

Forms use `<form action={...}>` or `useActionState` in client wrappers where UX needs pending states.

---

## API routes (binary / upload only)

| Route | Method | Body | Response |
|-------|--------|------|----------|
| `/api/attachments` | POST | `multipart/form-data`: `file`, `entityType`, `entityId` | `{ id, url }` |
| `/api/attachments/[id]` | GET | — | file stream with `Content-Type` |
| `/api/health` | GET | — | `{ ok: true }` |

Do not add REST CRUD APIs for feature entities — server actions are the default.

---

## Navigation & home page data

Home `app/(app)/page.tsx` fetches parallel summaries:

```yaml
home_sections:
  stream:
    query: pinned + recent open entries, limit 5
  restaurants:
    query: status=want_to_try, limit 5
  projects:
    query: status=in_progress OR recently updated, limit 5
  trackers:
    query: each tracker latest entry; flag if stale (configurable threshold)
  events:
    query: starts_at within next 14 days, limit 5
  notifications:
    query: unread count since last_seen_at for badge
```

Each section is a Server Component with a link to the full feature route.

---

## Auth routes (detail)

Login page posts to `login` server action — not a separate API route. Logout via form POST to `logout` action.

Bootstrap is CLI-only (`scripts/auth-bootstrap.ts`), not a web route.

---

## File naming

| Kind | Pattern | Example |
|------|---------|---------|
| Page | `page.tsx` | `app/(app)/stream/page.tsx` |
| Layout | `layout.tsx` | `app/(app)/layout.tsx` |
| Server action module | kebab or domain name | `src/lib/actions/stream.ts` |
| Component | PascalCase file | `src/components/StreamEntryForm.tsx` |
| Test | co-located | `src/lib/mentions/parse.test.ts` |

---

## Routes summary (machine-readable)

```yaml
routes:
  router: nextjs-app
  route_group_auth: (app)
  public: [/login, /api/health]
  authenticated:
    - /
    - /stream
    - /restaurants
    - /restaurants/[id]
    - /projects
    - /projects/[id]
    - /trackers
    - /trackers/[id]
    - /events
    - /notifications
    - /settings
  admin: [/admin/users]
  api:
    - POST /api/attachments
    - GET /api/attachments/[id]
  mutations: server_actions  # default
  middleware: middleware.ts
```
