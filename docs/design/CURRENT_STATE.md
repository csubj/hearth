# hearth — Current State Design Document

**Recommended path:** `docs/design/CURRENT_STATE.md`  
**Source of truth:** the actual code in `app/`, `src/`, `drizzle/`. The prose docs (`DESIGN.md`, `PRODUCT.md`, `docs/design/*`) describe intent and in places diverge from what is built; this document records what is actually implemented. Where a divergence exists, it is flagged in §11.

---

## 1. Overview

hearth is a Next.js 16 (App Router) + React 19 + Tailwind v4 web application for **single-household coordination**. It is a private, multi-user (household-member) record of properties, inventory, maintenance, projects, restaurants, metrics, reminders, and notifications. There is **no multi-tenant/org concept** — all active users share one household dataset; the notion of "household" is implicit (there is no `household` table).

Primary entry points:
- `app/layout.tsx` — root layout, applies `data-theme` from the current user's `theme`, loads `Instrument_Serif` + `Spectral` fonts, wraps children in `ToastProvider` and `FlashToast`.
- `app/(app)/layout.tsx` — authed app shell: validates session, `touchLastSeen`, runs reminder processing, renders `AppNav` + `DesktopSectionNav`/`MobileSectionLinks`, header with `max-w-5xl`, plus the "Sections" mobile dropdown.
- `app/(app)/page.tsx` — the Home dashboard (see §6).
- `app/login/page.tsx` — standalone login page (not in `(app)`).

The data model and all mutations live under `src/db` and `src/lib`. Routes are under `app`. Server actions are under `src/lib/actions`. The REST API is under `app/api/v1` with resources in `src/lib/api`. Attachments are served/uploaded via `app/api/attachments`.

---

## 2. Tech Stack & Architecture

From `package.json`:
- **next** `^16.3.4` (App Router), **react** `^19.2.8`, **react-dom** `^19.2.8`
- **Tailwind CSS v4** (`@tailwindcss/postcss`), **drizzle-orm** `^0.45.2` + **better-sqlite3** `^13.0.3` (synchronous SQLite)
- **zod** `^4.5.4`
- **react-aria-components** `^1.21.1`, **radix-ui** (`@radix-ui/react-collapsible/dialog/dropdown-menu/popover/tabs`)
- **recharts** `^3.10.1` (metrics charts), **@node-rs/argon2** (password hashing), **@asteasolutions/zod-to-openapi** + **@scalar/nextjs-api-reference** (OpenAPI), **react-markdown** + **remark-gfm** (notes rendering)

Scripts (`package.json`): `dev`, `build`, `start`, `test`, `lint`, `format`, `typecheck`, `db:migrate`, `db:generate`, `auth:bootstrap`, `auth:create-token`, `smoke:docker`.

**Path conventions:**
- `app/` = Next.js routes. A route group `app/(app)/` wraps authenticated pages. `app/login/` is the login page. `app/api/` holds route handlers.
- `src/db/schema/*` = Drizzle data model (one file per domain).
- `src/lib/actions/*` = **server actions** (`"use server"`) for mutations.
- `src/lib/api/*` = REST API helpers (resources, serializers, schemas, OpenAPI registration, pagination, token crypto).
- `src/lib/auth/*` = auth (session store, password, guards, api-tokens).
- `src/components/**` = UI components (client components).
- Per-domain libs: `src/lib/{home,inventory,maintenance,metrics,projects,restaurants,reminders,mentions,notifications,attachments}`.

**Server components vs server actions vs API routes:** Pages are async server components calling read functions in `src/lib/actions/*` (which themselves call `requireUser()`). Mutations are `"use server"` actions invoked from forms (with `useActionState`-style state objects) or directly from other server actions. The REST API in `app/api/v1/**` is a parallel programmatic surface authenticated by bearer API tokens; it reuses the same DB layer. `app/api/attachments/**`, `app/api/inventory/export`, `app/api/inventory/import`, and `app/api/docs` use **session-cookie** auth instead (via `src/lib/attachments/auth.ts`).

**DB driver:** `getDb()` in `src/db/index.ts` opens a single lazy `better-sqlite3` singleton, sets `foreign_keys = ON` and `busy_timeout = 5000`, and **auto-runs `drizzle-kit migrate`** from `./drizzle` unless `SKIP_AUTO_MIGRATE=1`. DB path from `DATABASE_URL` (default `file:./data/hearth.db`). `resetDbForTests()` re-opens for tests. `drizzle.config.ts` points schema at `./src/db/schema/index.ts`, out `./drizzle`, dialect `sqlite`. Race errors (`"already exists"`) are tolerated if migrations appear complete.

---

## 3. Auth & User Management

Auth was refactored from Lucia to a **custom session store** (`src/lib/auth/session-store.ts`).

### Sessions
- `sessions` table: `id`, `user_id` (FK cascade), `expires_at`.
- `SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60` (30 days), stored **in seconds** for DB compat with the prior library.
- `SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "hearth_session"` (`src/lib/auth/constants.ts`). Cookie: `httpOnly: true`, `secure` in production, `sameSite: "lax"`, `path: "/"`.
- `createSession(userId)` inserts a `randomUUID()` id, returns `fresh: true`. `validateSession(sessionId)` inner-joins `users`, deletes expired rows. `invalidateSession`, `invalidateUserSessions`. Session cookie value is the **opaque DB id** (not signed). The `sessionStore` object exposes a "Facade kept for callers that used the old Lucia instance API."
- `src/lib/auth/session.ts`: `validateRequest` is React-`cache`d; refreshes a fresh session cookie, clears a blank cookie when invalid; falls back to open-mode user; invalidates session if the user is `disabledAt`. `requireUser()` redirects to `/login`; `requireAdmin()` redirects with `returnTo=/admin` and enforces `role === "admin"` and real (non-open-mode) session, else `/login` or `/?error=Admin access required`. `displayName()` returns `displayName ?? username`. `touchLastSeen` updates `lastSeenAt`.
- `AuthUser` = `{ id, username, displayName, role: "member"|"admin", theme, disabledAt }`.

### Auth modes (`src/lib/auth/config.ts`)
- `AUTH_MODE` = `required` (default) or `open`. In open mode, when no session exists the app attributes writes to `OPEN_MODE_USERNAME` — creating a fake session id `__hearth_open_mode__` and resolving that user if not disabled. **Open mode does not grant admin** (see `requireAdmin`).
- `middleware.ts`: `PUBLIC_PATHS = ["/login", "/api/health", "/api/openapi.json", "/api/docs"]`; `/api/v1/*` is passed through (API handles its own auth); `/admin` requires a session cookie (redirects to `/login?returnTo=`); otherwise if not open mode, missing cookie → `/login?returnTo=`. The `/login` page never bounces on cookie alone (avoids redirect loop). Matcher excludes static assets.

### Passwords (`src/lib/auth/password.ts`)
- Argon2 via `@node-rs/argon2`, options: `memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1`. `hashPassword`, `verifyPassword` (returns false on error), `validatePasswordPolicy` (min 8, max 128).

### Login / logout / change password (`src/lib/actions/auth.ts`)
- `login`: validates username+password; **rate limit** — in-memory `Map` keyed by `username:ip`, max 5 attempts per 15 min (`MAX_LOGIN_ATTEMPTS=5`, `LOGIN_WINDOW_MS=15*60*1000`). Unknown/disabled users get a dummy-hash `verify` for timing resistance; password length outside policy rejected. On success creates session, sets cookie, touches `lastSeenAt`, and redirects to a sanitized `returnTo` (must start with `/` and not `//`).
- `logout`: invalidates session, clears cookie, redirects `/login`.
- `changePassword`: requires current password, new === confirm, policy validation; rehashes, `invalidateUserSessions`, creates a new session (keeps this device signed in), redirects `/settings?changed=1`.

### Roles & admin panel
- Users have `role` (`member`/`admin`). **Admin account bootstrap:** `scripts/auth-bootstrap.ts` (also `pnpm auth:bootstrap`) refuses if users exist, prompts (or reads `HEARTH_BOOTSTRAP_USERNAME/PASSWORD/DISPLAY_NAME`), and creates the **first admin**.
- Admin users actions (`src/lib/actions/admin/users.ts`): `createUser`, `resetUserPassword`, `disableUser`, `enableUser`, `promoteToAdmin`, `demoteFromAdmin`. Emit `user.admin_action` notifications to other admins; `resetUserPassword`/`disable` invalidate sessions.
- Admin guards (`src/lib/auth/admin-guards.ts`): `countActiveAdmins`; `canDisableUser`/`canDemoteAdmin` reject disabling/demoting the last active admin and self-demotion/self-disable as last admin (`AdminGuardError`).

### API tokens (`src/lib/auth/api-tokens.ts`, `src/lib/api/token-crypto.ts`)
- Token format: `hearth_pat_` + 32 random bytes base64url; `prefix` = first 16 chars; `tokenHash` = sha256 hex. `generateApiTokenSecret`, `hashApiToken`.
- `createApiTokenForUser`, `revokeApiTokenById`, `listApiTokens`. Admin page `app/(app)/admin/api-tokens/` and actions `src/lib/actions/admin/api-tokens.ts` (`createToken`, `revokeToken`, `listUsersForTokenForm`). CLI `scripts/auth-create-token.ts` (`HEARTH_TOKEN_USERNAME`, `HEARTH_TOKEN_NAME`).
- REST auth: `requireApiToken(request)` in `src/lib/api/auth.ts` reads `Authorization: Bearer <token>`, looks up `prefix`, compares sha256 hash, checks `revokedAt` and user `disabledAt`, updates `lastUsedAt`. **`requireApiToken` cannot fall back to session/cookie auth** — the attachments API is the only cookie-authenticated REST surface.

### Environment variables (`.env.example`)
`DATABASE_URL`, `SESSION_SECRET` (reserved/unused — flagged "Lucia uses opaque DB session IDs"), `PORT`, `NODE_ENV`, `AUTH_MODE=required|open`, `OPEN_MODE_USERNAME`, `UPLOADS_DIR=data/uploads`, `HEARTH_BOOTSTRAP_*`.

---

## 4. Data Model (`src/db/schema/*`, exported by `src/db/schema/index.ts`)

All PKs are `text` UUIDs; timestamps are `integer mode:"timestamp_ms"`. Migrations `drizzle/0000…0017` track history: `0000_baseline`, `0001_complete_reptil`, `0002_notifications_mentions`, `0003_abnormal_siren`, `0004_rename_trackers_to_metrics`, `0005_broken_lucky_pierre`, `0006_fat_night_thrasher`, `0007_projects_v2_drop_stream`, `0008_project_component_budgeting`, `0009_metric_reminder_interval`, `0010_inventory_maintenance_reminders`, `0011_user_theme`, `0013_maintenance_logs`, `0014_drop_maintenance_status`, `0015_home_log`, `0016_inventory_items_kind_space_id`, `0017_drop_home_items`. **There is no `0012` migration** (numbering gap) — a quirk.

- **users** (`users.ts`): `id` PK, `username` unique, `display_name`, `password_hash`, `role` enum(member|admin) default member, `theme` enum(default|warm|dark|gamer) default default, `disabled_at`, `last_seen_at`, `created_at`, `updated_at`.
- **sessions** (`sessions.ts`): `id` PK, `user_id` → users (cascade), `expires_at` (seconds).
- **api_tokens** (`api-tokens.ts`): `id` PK, `user_id` → users, `name`, `prefix` unique, `token_hash`, `last_used_at`, `revoked_at`, `created_at`; indexes `api_tokens_user_id_idx`, `api_tokens_prefix_idx`.
- **home_spaces** (`home.ts`): `id` PK, `parent_id` self-FK cascade, `kind` enum(property|structure|room|area), `name`, `address`, `notes`, `sort_order`, `created_by_user_id`, `updated_by_user_id`, timestamps; indexes parent_id, kind, updated_at. `HOME_SPACE_KINDS`, `HomeSpaceKind` exported.
- **home_links** (`home.ts`): `id`, `source_type` enum(home_space), `source_id`, `target_type` enum(maintenance_log|project), `target_id`, `created_by_user_id`, `created_at`; unique on (source_type,source_id,target_type,target_id); indexes source, target. **Note:** `home_links.source_id` has no FK cascade (delete is handled manually).
- **inventory_items** (`inventory.ts`): `id`, `name`, `brand`, `model`, `serial`, `kind` enum(paint|fixture|flooring|window_treatment|electrical|plumbing|appliance|furniture|generic), `space_id` → home_spaces (set null on delete), `color_name`, `color_hex`, `finish`, `product_url`, `purchase_date`, `store`, `price`, `warranty_note`, `notes`, created/updated by user, timestamps; indexes name, kind, space_id, updated_at. Also `inventory_links` (item_id, label, url), `inventory_tags` (name unique), `inventory_item_tags` (composite PK item+tag), `inventory_maintenance_reminders` (item_id, title, notes, reminder_interval_count/unit, reminder_recipient_user_id, last_completed_at, last_reminder_at…), `inventory_maintenance_reminder_links`. `inventoryItemKinds`, `decorativeInventoryKinds` = [paint, fixture, flooring, window_treatment] exported.
- **maintenance_logs** (`maintenance.ts`): `id`, `title`, `notes`, `category`, `company`, `cost_cents`, `started_at`, `completed_at`, created/updated by user, timestamps; indexes updated_at, category, company. **No `status` column** (dropped in `0014`). Also `maintenance_log_links`, `maintenance_log_tags`, `maintenance_log_item_tags`, `maintenance_log_reminders` (log_id, title, notes, `reminder_type` enum(interval|one_time), interval count/unit, `due_at`, recipient, last_completed_at, last_reminder_at), `maintenance_log_projects` (composite PK log+project), `maintenance_log_inventory_items` (composite PK).
- **metrics** (`metrics.ts`): `id`, `name`, `unit`, `reminder_interval_count`, `reminder_interval_unit` enum(day|week|month|year), `last_reminder_at`, `reminder_recipient_user_id`, created_by, timestamps. `metric_entries`: `id`, `metric_id` cascade, `value` (text, not numeric), `note`, `recorded_at`, `created_by_user_id`, `created_at`; index `(metric_id, recorded_at)`. `metricReminderUnits` exported.
- **projects** (`projects.ts`): `id`, `title`, `notes`, `status` enum(idea|in_progress|done), `priority` (int), `target_when`, `budget_cents`, created/updated by user, timestamps; indexes (status,updated_at), priority. `project_links`, `project_tags`, `project_item_tags`, **project_components** (`project_id` cascade, `name`, `kind` enum(item|labor|fee|other), `quantity`, `unit_cost_cents`, `acquired` bool, `acquired_at`, `purchase_url`, `sort_order`, `note`, timestamps).
- **restaurants** (`restaurants.ts`): `id`, `name`, `neighborhood`, `address`, `notes`, `status` enum(want_to_try|visited), `rating` (1–5), `visit_note`, `visited_at`, created/updated by user, timestamps; indexes (status,created_at), rating.
- **notifications** (`notifications.ts`): `id`, `recipient_user_id`, `actor_user_id` (nullable), `type` (string, free-form e.g. `mention`, `inventory.created`, `metric.reminder`), `entity_type`, `entity_id`, `summary`, `read_at`, `created_at`; indexes (recipient,created_at), (recipient,read_at).
- **mentions** (`mentions.ts`): `id`, `mentioned_user_id`, `entity_type`, `entity_id`, `created_by_user_id`, `created_at`; indexes (mentioned_user,created_at), (entity_type,entity_id).
- **attachments** (`attachments.ts`): `id`, `entity_type`, `entity_id`, `filename`, `mime_type`, `size_bytes`, `storage_path`, `created_by_user_id`, `created_at`; index (entity_type,entity_id).

---

## 5. Features & Module Behavior

All mutations are Server Actions in `src/lib/actions/*`. Read helpers double as queries.

### Home Log (space tree)
- `src/lib/actions/home.ts`: `getHomeRoots`, `listAllHomeSpaces`, `getHomeTree` (cache), `getHomeSpaceById` (children/items/links/breadcrumb), `getHomeLogHomeSummary`, `getHomeLogHomeStats`, `createHomeSpace`, `updateHomeSpace`, `updateHomeSpaceNotes`, `deleteHomeSpace` (collects descendant space ids and removes their `home_links`, then cascades), plus `linkHomeEntity`/`unlinkHomeEntity`/`createHomeLink`/`removeHomeLinksForTarget`, and search helpers `searchMaintenanceForLink`, `searchInventoryForHomeLink`, `searchProjectsForHomeLink`, `listHomeReferencesForTarget`.
- `app/(app)/home-log/page.tsx` renders a `PropertyPlan` per root property with counts, and an "Add property" `CreateDialog` (default kind `property`). `app/(app)/home-log/[id]/page.tsx` renders `HomeSpaceDetail` with breadcrumb, children, items, links, plus "Add space" (default kind `room`). `[id]/[section]/page.tsx` supports sections `materials`, `inventory`, `maintenance`, `projects` (`HOME_LOG_SECTIONS` in `src/components/home/HomeSpaceSectionsNav.tsx`). "Materials" filters to `decorativeInventoryKinds`. Create dialogs pass `homeLinkSourceType`/`homeLinkSourceId` for auto-linking.
- Auto-linking: `src/lib/home/auto-link.ts` `maybeAutoLinkToHome` reads `homeLinkSourceType` + `homeLinkSourceId` from a create form and links a new project/maintenance record to the home space.

### Inventory
- `src/lib/actions/inventory.ts`: `listInventoryTags`, `listInventoryItemKinds`, `listInventoryItems` (filters `q`, `tag`, `kind`; search across name/brand/model/serial/notes), `listInventoryItemsPage`, `getInventoryItemById` (returns detail with tags/links/maintenanceReminders/space), `getInventoryHomeSummary`, `getInventoryHomeStats`, `create`, `update`, `addLink`, `removeLink`, `setTags`, `buildInventoryExport`, `importInventoryData`.
- **kind/space/color/finish/productUrl fields** are the recent refactor (`0016`). Color hex normalized via `src/lib/home/item-presets.ts` `normalizeColorHex` (accepts `#RGB`/`#RRGGBB`, returns uppercase `#RRGGBB`); presets (`ITEM_KIND_PRESETS`) define which optional fields are shown per kind and whether a color swatch renders (paint shows swatch). `decorativeInventoryKinds` = `paint, fixture, flooring, window_treatment`; appliance/electrical/plumbing/furniture = equipment fields.
- Maintenance reminders per item (`src/lib/actions/inventory-maintenance.ts` + `inventory-maintenance-mutations.ts`): `loadMaintenanceRemindersForItem`, `createMaintenanceReminder`, `updateMaintenanceReminder`, `deleteMaintenanceReminder`, `completeMaintenanceReminder` (sets `lastCompletedAt`), `addMaintenanceReminderLink`, `removeMaintenanceReminderLink`. Interval anchor = `lastCompletedAt ?? createdAt` (`src/lib/inventory/reminder-interval.ts`).
- Inventory export/import (`app/api/inventory/export|import`) — `buildInventoryExport` returns `{version:1, exportedAt, tags, items}` with nested links/reminders/attachments; `importInventoryData` upserts by id and **replaces** `inventory_links` and `inventory_maintenance_reminders` on existing items.

### Maintenance
- `src/lib/actions/maintenance.ts`: `listMaintenanceTags`, `listMaintenanceCategories` (distinct non-empty categories), `listMaintenanceLogs`, `listMaintenanceLogsPage`, `getMaintenanceLogById`, `getMaintenanceHomeSummary`, `getMaintenanceHomeStats`, `createMaintenanceLog`, `updateMaintenanceLog` (costCents parsed as dollars → cents), `deleteMaintenanceLog` (removes home links first), `setMaintenanceTags`, `addMaintenanceLink`, `removeMaintenanceLink`, `linkMaintenanceProject`/`unlinkMaintenanceProject`, `linkMaintenanceInventoryItem`/`unlinkMaintenanceInventoryItem`, `updateMaintenanceNotes`, and search helpers.
- Reminders (`src/lib/actions/maintenance-log-reminders.ts` + `-mutations.ts`): `createMaintenanceLogReminder`, `updateMaintenanceLogReminder`, `deleteMaintenanceLogReminder`, `completeMaintenanceLogReminder`. Types `interval` or `one_time`; interval anchor = `lastCompletedAt ?? createdAt` (`src/lib/maintenance/reminder-interval.ts`); one-time uses `due_at`.
- Auto-link to home on create via `maybeAutoLinkToHome`.

### Reminders & intervals
- Shared logic `src/lib/reminders/interval.ts`: units day/week/month/year, `addReminderInterval`, `hasReminderInterval`, `isStale`, `isDueForReminder` (re-reminds after `lastReminderAt` + interval), `formatReminderInterval`, `formatReminderDueLabel`, `DEFAULT_REMINDER_INTERVAL_COUNT=7`/unit `day`.
- Recipient scoping `src/lib/reminders/scope.ts`: `resolveReminderRecipientIds` (specific user if set and active, else all active users); `isReminderVisibleToUser` means a reminder with no recipient is visible to everyone.
- Upcoming feed `src/lib/reminders/feed.ts`: `listUpcomingReminders` merges inventory-maintenance, metric, maintenance-log reminders, filters to overdue or within `withinDays` (default 14), sorts overdue-first then due date; kinds `inventory_maintenance|metric|maintenance_log`, status `overdue|due_soon`.
- Reminder processing runs on **every** `AppLayout` render (wrapped in try/catch so it never blocks): `processMetricReminders` (`src/lib/metrics/reminders.ts`), `processInventoryMaintenanceReminders`, `processMaintenanceLogReminders`. Each emits a notification and updates `lastReminderAt`.

### Metrics
- `src/lib/actions/metrics.ts` + `metrics-mutations.ts` + `metrics-list.ts`: `listMetricsWithLatest` (computes `stale` via `isMetricStale`), `getMetricWithEntries`, `getMetricsHomeSummary`, `getMetricsHomeStats`, `createMetric`, `updateMetric`, `addEntry`. `addEntryRecord` resets `lastReminderAt` to null on new entry, emits `metric.entry_added` activity, parses mentions from note. Charts via `src/components/metrics/MetricChart.tsx` (recharts `LineChart`, X axis label, note tooltip). Metric entries paginated by `recorded_at` cursor (`metricEntryCursorCondition`). `createMetricSchema` requires interval fields when reminders enabled.

### Restaurants
- `src/lib/actions/restaurants.ts`: `listRestaurants`/`listRestaurantsPage` (filters `status` all|want_to_try|visited, `sort` created_at|rating, `neighborhood`, `addedBy`), `listRestaurantNeighborhoods`, `getRestaurantById`, `getWantToTryPreview`, `getRestaurantsHomeStats`. Mutations: `create` (status starts `want_to_try`), `update`, `markVisited` (sets status/visitedAt/visitNote/rating, only when currently `want_to_try`), `setRating` (only on visited). Mentions parsed from notes+visitNote (`combineRestaurantMentionText`).

### Projects
- `src/lib/actions/projects.ts`: `listProjectTags`, `listProjects`/`listProjectsPage` (filters `q`,`tag`,`status`,`sort` updated_desc|priority_desc|cost_desc), `getProjectById` (with `componentRollups`), `getProjectsHomeSummary` (non-done, priority then in_progress), `getProjectsHomeStats`. Mutations: `create` (title derived from notes via `deriveProjectTitle` — first non-empty notes line or `Untitled <date>`; auto-links to home), `updateTitle`, `updateNotes` (optional `reconcileMentions`), `setStatus`, `setPriority` (1–5), `setTags`, `addLink`/`removeLink`, component CRUD: `addComponent`, `updateComponent`, `setComponentAcquired`, `removeComponent`, `reorderComponent` (swap sortOrder). `deleteProject` removes home links then deletes.
- Rollups in `src/lib/projects/rollups.ts`: `sumComponentCosts` (quantity×unitCost), `sumAcquiredCosts`, `countAcquired`, `componentRollups` → `{estimatedCostCents, acquiredCostCents, remainingCostCents, acquiredCount, componentCount}`. `src/components/projects/format.ts` has `deriveProjectTitle`, `formatCents`, `parseDollarsToCents`, `notesExcerpt`, kind labels.

### Notifications
- `src/lib/notifications/emit.ts`: `emitHouseholdActivity` (all active users except actor; `user.admin_action` → admins only; `extraRecipients`), `emitMentions` (deletes/re-inserts mention rows per entity, only notifies **newly** mentioned users), `emitIntervalReminder`/`emitMetricReminder`/`emitInventoryMaintenanceReminder`/`emitMaintenanceLogReminder`.
- Queries `src/lib/notifications/queries.ts`: `getPreviousLastSeenAt` (cached), `getUnreadNotificationCount`, `listNotifications`, `listSinceLastVisit`. Routes `src/lib/notifications/routes.ts`: `getNotificationHref` maps entity → href.
- Actions `src/lib/actions/notifications.ts`: `markRead`, `markAllRead`, `deleteNotification`, `clearReadNotifications`, `openNotification` (marks read then redirects).

### Mentions
- `src/lib/mentions/parse.ts`: regex `@([a-zA-Z0-9_]+)`; matches username (case-insensitive) or normalized display name (spaces→underscores); returns deduped ids for known active users. Used by `emitMentions`, which deletes/recreates mention rows per entity and only notifies **newly** mentioned users. `src/components/MentionTextarea.tsx` is the mention UI.

### Attachments
- `src/lib/attachments/`: `entity.ts` defines `ATTACHMENT_ENTITY_TYPES = [restaurant, project, metric_entry, inventory_item, maintenance_log, home_space]` and `entityExists`. `config.ts` allows images (jpeg/png/webp/gif) everywhere and **PDF** only for `DOCUMENT_ENTITY_TYPES = [inventory_item, project, maintenance_log, home_space]`; `MAX_ATTACHMENT_BYTES_IMAGE=10MB`, `MAX_ATTACHMENT_BYTES_DOCUMENT=25MB`, `MAX_ATTACHMENTS_PER_ENTITY=10`. `mime.ts` content-sniffs magic bytes (JPEG/PNG/GIF/WebP/PDF) and checks filename extension matches. `upload.ts` enforces limits, writes via `storage.ts` (path-traversal guard, `resolveUploadPath`, `UPLOADS_DIR` or `data/uploads`), stores metadata, and emits an activity notification. `queries.ts` `listAttachmentsForEntity`, `attachmentUrl` → `/api/attachments/:id`. `auth.ts` uses `validateApiSession` (session-cookie based). Delete allowed by owner or admin (403 otherwise).
- Routes: `POST /api/attachments` (multipart form with `file`, `entityType`, `entityId`), `GET/DELETE /api/attachments/[id]`. GET streams bytes with `Content-Type`, `Content-Length`, `Cache-Control: private, max-age=3600`.

### Admin, Settings, Browse, Home dashboard
- **Admin**: `app/(app)/admin/users/page.tsx`, `app/(app)/admin/api-tokens/page.tsx` (admin-only, `requireAdmin`).
- **Settings**: `app/(app)/settings/page.tsx`; `src/lib/actions/settings.ts` `updateTheme` (themes `default|warm|dark|gamer`, stored on `users.theme`, `revalidatePath("/","layout")`).
- **Browse**: `app/(app)/browse/page.tsx` — card list of modules with live counts (reachable but not in the section nav).
- **Notifications page**: `app/(app)/notifications/page.tsx`.
- **Reminders page**: `app/(app)/reminders/page.tsx` (uses `getUpcomingReminders`).
- **Home dashboard**: `app/(app)/page.tsx` — sections in order: `UpcomingRemindersSection`, `SinceLastVisitSection`, `ProjectsSection`, `RestaurantsSection`, `MetricsSection`, `InventorySection`, `MaintenanceSection`, `HomeLogSection`, `QuickCaptureLine`. `src/components/home/` holds these components.

---

## 6. UI / Navigation

- `src/components/SectionNav.tsx`: `sections` array = `/` (Home), `/restaurants`, `/projects`, `/metrics`, `/inventory`, `/maintenance`, `/home-log`, `/reminders`. `DesktopSectionNav` shows all; `MobileSectionLinks` is shown in a "Sections" `<details>` dropdown on mobile.
- `src/components/AppNav.tsx`: bell icon (unread count badge, `9+` cap) linking to `/notifications`, and a `HoverDetailsMenu` (user menu) with **Admin** (if `role==="admin"`) → `/admin/users`, **Settings** → `/settings`, and a **Logout** form action.
- `app/(app)/layout.tsx` validates sessions (`redirect("/login")`), touches lastSeen, runs reminder processing, renders header + `SectionNav` + main `max-w-5xl`. Mobile shows the "Sections" dropdown.
- Root `app/layout.tsx` sets `data-theme` from user theme, loads fonts, wraps in `ToastProvider`/`FlashToast`.
- **List/detail pattern**: each module has an index page (cards/table) and a detail page (`[id]`). Filters use search params (`q`, `tag`, `kind`, `category`). Infinite lists use **offset-based pagination** (`listXxxPage(offset, 25)`, `nextOffset`, `default page size 25, max 100`).
- UI primitives in `src/components/ui/`: `Button`, `Collapsible`, `ConfirmDialog`, `CreateDialog`, `Dialog`, `FormSubmitButton`, `InfiniteList`, `ToastProvider`. `HoverDetailsMenu`, `MentionTextarea`, `Attachments`/`AttachmentsPanel`.
- Theme picker stored on `users.theme`; root layout sets `data-theme`. Themes: `default`, `warm`, `dark`, `gamer`.
- Responsive: `max-w-5xl` container, `md:` two-column layouts (`md:grid-cols-[10rem_1fr]` on home dashboard), mobile nav collapses into a dropdown.

---

## 7. REST API (`app/api/v1/**`)

All `/api/v1/*` routes require `Authorization: Bearer <token>` via `requireApiToken` (401 `unauthorizedError` if absent/invalid/revoked/disabled). Response envelope for lists is `{ data: [...], nextCursor: string|null }`. Pagination (`src/lib/api/pagination.ts`): `limit` (1–100, default 50), optional `cursor` (base64url of `{t: createdAtMs, id}`); list endpoints fetch `limit+1` to detect more. `src/lib/api/errors.ts` provides `apiError(code,message,status,details)` and helpers `unauthorizedError`, `notFoundError`, `validationError` (zod → 400 with `details[{path,message}]`), `jsonOk`. Error body shape `{error:{code,message,details?}}`; codes: `validation_error|unauthorized|forbidden|not_found|conflict|internal_error`.

**Endpoints:**
- **Restaurants**: `GET/POST /api/v1/restaurants`; `GET/PATCH/DELETE /api/v1/restaurants/[id]`.
- **Projects**: `GET/POST /api/v1/projects`; `GET/PATCH/DELETE /api/v1/projects/[id]`; `GET/POST /api/v1/projects/[id]/components`; `GET/PATCH/DELETE /api/v1/projects/[id]/components/[componentId]`.
- **Metrics**: `GET/POST /api/v1/metrics`; `GET/PATCH/DELETE /api/v1/metrics/[id]`; `GET/POST /api/v1/metrics/[id]/entries`; `GET/PATCH/DELETE /api/v1/metrics/[id]/entries/[entryId]`. Metric-entry cursor keys off `recorded_at`.
- **Inventory**: `GET/POST /api/v1/inventory` (query `q`,`tag`,`kind`); `GET/PATCH/DELETE /api/v1/inventory/[id]`; `inventory/tags` (`GET/POST`, `GET/PATCH/DELETE /[id]`); `inventory/types` (`GET` returns the fixed enum list, `PATCH/DELETE /[name]` — **these are effectively stubs that return success without persisting changes**); `inventory/[id]/maintenance-reminders` (list/create), `/[reminderId]` (get/patch/delete), `/[reminderId]/complete` (POST).
- **Maintenance**: `GET/POST /api/v1/maintenance`; `GET/PATCH/DELETE /api/v1/maintenance/[id]`; `GET /api/v1/maintenance/categories`.
- **Home Log**: `GET/POST /api/v1/home/spaces`; `GET/PATCH/DELETE /api/v1/home/spaces/[id]`.

**Serialization & conventions:**
- Dates serialized via `toIso` (`new Date().toISOString()`), nullable when absent (`src/lib/api/serialize.ts`).
- Inventory list uses a **`updatedAt`-cursor** and `nextCursor` built inline (not `paginateRows`); maintenance uses `paginateRows` with `updatedAt`; other resources cursor on `createdAt`/`updatedAt` as appropriate. **The web UI uses offset-based pagination, while the REST API uses cursor-based** — two distinct systems.
- **OpenAPI**: `src/lib/api/openapi.ts` registers a generic `registerResource` (list/post/get-one/patch/delete) plus specialized `registerProjectComponentsResource`, `registerMetricEntriesResource`, `registerInventoryMaintenanceRemindersResource`, `registerHomeResources`. `src/lib/api/register-openapi.ts` wires them up. `GET /api/openapi.json` returns the document; `GET /api/docs` renders Scalar (`@scalar/nextjs-api-reference`). Security scheme is `bearerAuth` ("API token created in Admin → API tokens or via auth:create-token CLI"). Many schemas are generic `{ type: "object" }` placeholders rather than concrete field-level OpenAPI schemas — **a known limitation**.
- **Non-`/v1` API:** `/api/attachments/**` (session-cookie auth), `/api/inventory/export` (GET JSON), `/api/inventory/import` (POST JSON, session auth), `/api/health` (public, `{ok:true}`), `/api/openapi.json` (public), `/api/docs` (public).

---

## 8. Server Actions (`src/lib/actions/*`)

- `auth.ts` — login/logout/changePassword (see §3).
- `settings.ts` — `updateTheme`.
- `notifications.ts` — markRead/markAllRead/deleteNotification/clearReadNotifications/openNotification.
- `home.ts` — space CRUD, tree/link reads, cross-entity link mutations, auto-link helper.
- `inventory.ts`, `inventory-maintenance.ts` — item CRUD, links, tags, maintenance reminders, export/import.
- `maintenance.ts`, `maintenance-log-reminders.ts` — log CRUD, tags, links, project/item association, reminders.
- `metrics.ts`, `metrics-mutations.ts`, `metrics-list.ts` — metric/entry CRUD and reminder handling.
- `projects.ts` — project CRUD, title/notes/status/priority/tags, links, components (add/update/setAcquired/remove/reorder).
- `restaurants.ts` — CRUD, markVisited, setRating.
- `reminders.ts` — `getUpcomingReminders`, `getRemindersHomeStats`.
- `admin/users.ts`, `admin/api-tokens.ts` — admin user + token actions.

All mutations `await requireUser()`/`requireAdmin()`, perform DB writes, emit `emitHouseholdActivity`/`emitMentions`, and `revalidatePath` on affected routes.

---

## 9. Attachments & File Storage

Files are stored under `UPLOADS_DIR` (default `data/uploads`), named `${uuid}.${ext}`, with DB metadata in `attachments`. `storage.ts` resolves paths under the uploads dir and rejects traversal. MIME is content-sniffed from magic bytes (not trusted from extension) and filename extension must match. Max 10 files per entity; only the creator or an admin may delete. Serving via `/api/attachments/[id]` with `Cache-Control: private, max-age=3600`. Upload validates entity existence, size limits, empty file, mime, per-entity mime, extension match; enforces per-entity count in a transaction; emits a household notification. Allowed types are images (jpeg/png/webp/gif) everywhere, plus PDF only for inventory_item/project/maintenance_log/home_space.

---

## 10. Cross-Cutting Behaviors

- **Mentions**: `@username` or `@Display Name` (spaces→underscore) parsed from notes on create/update; deduped; only newly-mentioned users are notified (`emitMentions`). Enabled for restaurant, project, metric entry, inventory item, maintenance log, home space notes.
- **Auto-linking**: creating a project/maintenance/inventory record from a home-log section auto-links it to the home space (`src/lib/home/auto-link.ts`).
- **Item presets**: per-kind field toggles & swatch behavior (`item-presets.ts`).
- **Search/browse**: per-section list search (`listInventoryItems`, `listProjects`, etc.) plus `/browse` area index. Inventory/project lists support tag filters.
- **Notes editing & ReactMarkdown**: notes rendered with `react-markdown`+`remark-gfm`; `updateXNotes` actions set notes and optionally reconcile mentions.
- **Related panels**: `HomeRelatedPanel` (`src/components/home/HomeRelatedPanel.tsx`) surfaces linked maintenance/projects under a space.
- **Since-last-visit**: `getPreviousLastSeenAt` is read (cached) in the layout *before* `touchLastSeen`, then `listSinceLastVisit` shows notifications newer than last seen.
- **Upcoming reminders**: home dashboard + `/reminders` page show due/overdue reminders within a 14-day window.
- **Quick capture**: `QuickCaptureLine` on the Home dashboard.

---

## 11. Notable Quirks, TODOs & Divergences from Design Docs

- **Custom session store (Lucia removed):** Cookie is an **opaque DB id**, not signed; `SESSION_SECRET` is reserved/unused. Session expiry stored in seconds for compat with old data.
- **Auto-migrations:** `getDb()` runs migrations on first open; concurrent-start races are tolerated via the `already exists` check + applied-count validation.
- **Attachments auth vs API auth divergence:** `/api/attachments/*` and inventory export/import use **session** auth; `/api/v1/*` uses **bearer API tokens**, and the API works even in `AUTH_MODE=open`.
- **Entity-type sets differ across domains:** `notifications` `EntityType` includes `metric`; attachments/notes only allow `metric_entry`, `inventory_item`, `maintenance_log`, `home_space`, `project`, `restaurant`. `attachmentEntityTypeFromEntityType` drops `metric`.
- **Inventory "types"** in the API is actually just the fixed `inventoryItemKinds` enum (list/rename/delete are stubs; `renameInventoryTypeApi` just returns the new trimmed name without persisting anything, `deleteInventoryTypeApi` returns `true` for any valid built-in kind but does nothing) — not a separate user-defined type table.
- **Dual pagination systems:** the **UI uses offset-based** infinite lists (`listXxxPage(offset, 25)`, `nextOffset`), while the **REST API uses cursor-based** (`nextCursor`).
- **Reminder processing in layout** runs on every page render inside try/catch (silently skipped on failure).
- **Login rate limiter** is an in-memory `Map` (resets on server restart; keyed by `username:ip`) — not shared across instances.
- **Migration quirks:** numbering gap (`0012` missing). `0017` hard-codes a single `space_id` backfill for one inventory item, normalizes the legacy kind `"appliance,frids"` → `"appliance"`, and **drops `home_links` rows whose `target_type = 'inventory_item'`** — so home links now only target `maintenance_log` and `project`; inventory-to-home association is via `space_id` instead.
- **`home_links.source_id` has no FK cascade**; delete is handled manually in `deleteHomeSpace`.
- **Test helpers:** several `ensureXForTests` helpers (e.g. `ensureApiTokensTableForTests`, `ensureMetricTablesForTests`) create tables ad hoc, indicating migrations may not be authoritative in test environments.
- **Deprecated aliases:** `ALLOWED_MIME_TYPES`, `MAX_ATTACHMENT_BYTES` remain in `src/lib/attachments/config.ts`.
- **Projects/missions "budgeting"** rollups are computed on read (no stored rollup); `remainingCostCents` is derived (`estimated - acquired`).
- **Design docs vs code:** `DESIGN.md`, `PRODUCT.md`, and `docs/design/*` describe intent; this document reflects actual code. Where they conflict (e.g. maintenance status, inventory `kind`/`space`, custom sessions not Lucia, `streams` concept dropped, trackers renamed to metrics, `home_items` dropped), **trust the code**.
- **OpenAPI schemas are placeholders** — many resource schemas are generic objects, a key limitation for API consumers.
- **`inventory/types` endpoint is effectively a stub** (see above).

---

### Limitations of this document

This document was derived from source (schema, actions, resources, routes, components). It describes architecture and behaviors but does not enumerate every interactive dialog/field in the UI (e.g. exact `InventoryFilters` control markup) or every component in `src/components`. For a from-scratch rebuild, the schema files (`src/db/schema/*`), the API resource files (`src/lib/api/*-resources.ts`), and the action files (`src/lib/actions/*`) are the authoritative references.

### Summary of key source paths cited

- Schema: `src/db/schema/{users,sessions,api-tokens,home,inventory,maintenance,metrics,projects,restaurants,notifications,mentions,attachments,index}.ts`
- DB: `src/db/index.ts`, `drizzle.config.ts`, `drizzle/0000..0017_*.sql`
- Auth: `src/lib/auth/{session,session-store,password,config,constants,api-tokens,admin-guards}.ts`, `middleware.ts`
- API: `app/api/v1/**`, `app/api/{attachments,docs,health,inventory/export,inventory/import,openapi.json}`; `src/lib/api/*`
- Actions: `src/lib/actions/*`
- UI: `app/(app)/**`, `src/components/{AppNav,SectionNav,ui,home,inventory,maintenance,metrics,projects,restaurants,notifications,reminders,settings,auth,Attachments}.tsx`, `app/layout.tsx`, `app/(app)/layout.tsx`