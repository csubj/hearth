# hearth — Feature & Capability Guide

**Purpose of this document:** describe what hearth *does* from a product and user perspective, so another model (or a person) can quickly understand the app's capabilities without reading the code. For the technical implementation (schema, routes, actions, API), see [CURRENT_STATE.md](./CURRENT_STATE.md).

---

## What hearth is

hearth is a **private web app for a single household to coordinate shared domestic life**. Think of it as the household's shared notebook that everyone in the household can open and see: what needs attention, what the household is planning, and notes the household doesn't want to lose.

Key facts:
- **One household = one instance.** All users in an instance see the same shared data. There is no concept of separate households, teams, or organizations.
- **Shared by default.** Everything a member adds is visible to every other member.
- **Small household, not a work team.** A few partners, roommates, or family members. Not a corporate task manager.
- **Access via web** from phones and laptops. No mobile native app, no push notifications, no email digests.

The app is organized into **seven main sections** (plus a home dashboard and admin area), each covering a different domain of household life.

---

## The seven main sections

Navigation across the top (desktop) or a "Sections" menu (mobile) links to:

| Section | URL | What it's for |
| --- | --- | --- |
| **Home** | `/` | Dashboard — answer "what's going on" at a glance |
| **Restaurants** | `/restaurants` | Places the household wants to try or has visited |
| **Projects** | `/projects` | House projects with components and budgets |
| **Metrics** | `/metrics` | Numeric records tracked over time |
| **Inventory** | `/inventory` | Catalog of physical things the household owns |
| **Maintenance** | `/maintenance` | Log of services, repairs, and warranties |
| **Home Log** | `/home-log` | The household's properties and physical spaces |
| **Reminders** | `/reminders` | What's due or overdue across all features |

Each section follows a consistent pattern:
- An **index page** showing a searchable, filterable list of entries.
- A **detail page** for a single entry (view, edit, related items, attachments, notes).
- **Create forms** to add new entries (and edit/edit inline where appropriate).
- **Filters** (search text, tags, status/kind, category) usually mirrored in the URL query string.

---

## 1. Home dashboard (`/`)

A glanceable summary of everything in the household, laid out top-to-bottom:

1. **Upcoming reminders** — anything due or overdue soon (see Reminders).
2. **Since your last visit** — activity/notifications that happened since the member was last here.
3. **Projects** — active projects, prioritized.
4. **Restaurants** — places to try, and recent ratings.
5. **Metrics** — recent metric values to update.
6. **Inventory** — recent inventory activity.
7. **Maintenance** — recent maintenance records.
8. **Home Log** — the family's properties and spaces.
9. **Quick capture** — a single line to quickly add a note/reminder without navigating away.

On wider screens the dashboard has a narrow index rail on the left; on mobile it's a single scrolling sheet.

---

## 2. Restaurants

A list of places the household wants to try or has visited.

**What a user can do:**
- **Add a restaurant** with name, neighborhood, address, and notes.
- **Track status** — each place is either `want to try` or `visited`.
- **Mark as visited** — set the visited date and optionally record a **1–5 star rating** and a visit note.
- **Rate** a visited restaurant (and update the rating/note later).
- **Filter and search** by status, neighborhood, who added it, and sort by newest or by rating.
- **See a "want to try" preview** and a summary on the home dashboard.

When a restaurant is added or its notes change, members are notified; **@mentions** in notes notify specific members.

---

## 3. Projects

A place for household projects (e.g., "paint the kitchen", "build a garden shed").

**What a user can do:**
- **Create a project** with a title, notes, status, and priority. If only notes are given, the title is derived from the first notes line.
- **Track status** — `idea`, `in progress`, or `done`. Done entries are struck through.
- **Set a priority** (1–5).
- **Set optional target timing and a budget.**
- **Add components** to a project — line items like parts (`item`), labor, fees, or other. Each component has a name, kind, quantity, unit cost, an `acquired` flag, a purchase URL, and sorting.
- **Manage budget automatically** — the app totals estimated cost, acquired cost, and remaining cost from the components.
- **Link and unlink** a project to maintenance records, home spaces, and inventory items.
- **Add tags and external links** (e.g., a product page or manual).
- **Edit notes** (markdown supported) inline, with @mentions.
- **Filter** by status, tag, and sort by last updated, priority, or cost.

---

## 4. Metrics

A way to **track any number over time** — e.g., a pet's weight, water bill, or anything else you measure.

**What a user can do:**
- **Create a metric** with a name, optional unit, and optional reminder interval.
- **Record entries** — dated values (text) with an optional note. Each entry can be pinned to a specific date.
- **See a chart** — numeric metrics render as a line/point chart over time (recharts), with a table of exact values below.
- **Set a reminder** — get reminded to record the metric after a set interval (e.g., every week or month). A new entry resets the reminder.
- **Use @mentions** in entry notes to notify members.

---

## 5. Inventory

A searchable **catalog of physical things** the household owns — paint colors, appliance models, fixtures, and more.

**What a user can do:**
- **Add inventory items** with name, brand, model, serial, and more.
- **Categorize by kind** — `paint`, `fixture`, `flooring`, `window treatment`, `electrical`, `plumbing`, `appliance`, `furniture`, or `generic`.
- **Associate an item with a home space** (a room/area in your property), so you know where the item lives.
- **Record decorative details**, which show for decorative kinds (paint/fixture/flooring/window treatment): a **color name**, **color hex** (with a color swatch), **finish**, and **product URL**.
- **Record purchase details** — purchase date, store, price, warranty note, and notes.
- **Tag items** for flexible filtering/search; add external links.
- **Add maintenance reminders** on an item — scheduled follow-ups (e.g., "change filter every 6 months") with an interval and optional recipient.
- **Bulk import and export** the whole catalog as JSON (with links, reminders, and attachments), so the data is portable.
- **Upload photos** (and PDFs like manuals) to an item; documents are allowed on inventory items.

---

## 6. Maintenance

A **log of services, repairs, and warranties** for the home.

**What a user can do:**
- **Log a maintenance record** with title, notes, category, company, and cost.
- **Record dates** — start date and completion date.
- **Add tags, external links**, and associate a record with **projects** and **inventory items**.
- **Add follow-up reminders** — either periodic (`interval`, e.g., "every 6 months") or one-time (`one_time` with a specific due date), with an optional recipient.
- **Link a maintenance record to a home space** so it appears under that property/room.
- **Edit notes** (markdown) with @mentions.
- **Filter** by category, tag, and search text.

---

## 7. Home Log

A tree of the household's **properties and physical spaces** — a structured record of where things are.

**What a user can do:**
- **Organize spaces as a tree** with four kinds: `property` (a building/address), `structure` (e.g., a shed or garage), `room` (e.g., a bedroom), and `area` (e.g., a yard).
- **Nest spaces** — a property contains rooms, which can contain areas, and so on.
- **Add address, notes, and ordering** to each space.
- **Link entities to a space** — maintenance records and projects can be associated with a space so they appear under it.
- **See per-space sections** for the space's materials (decorative kinds), inventory, maintenance, and projects.
- **Auto-link** — when you add a project or maintenance record from within a space's section, it's automatically linked to that space.
- **Delete a space**, which removes its children and their links.

---

## 8. Reminders

A **unified feed of what's due** across metrics, inventory items, and maintenance records.

**What a user can do:**
- **See everything due or overdue** in one place, within a configurable window (default 14 days).
- **Complete a reminder** — marks it done and sets the next interval from now.
- **Target a reminder to a specific member**, or leave it shared (visible to everyone).
- **Understand due-ness** — a reminder is due if the elapsed time since its anchor (last completion, or creation) exceeds its interval, and it re-reminds after the interval since the last reminder.

Intervals use units of **day, week, month, or year**, and you can set any count (e.g., "every 3 months").

---

## 9. Notifications & @mentions

A per-member **activity feed** so the household can see what changed and who to acknowledge.

**What a user can do:**
- **See a notification bell** (with unread count) in the header, linking to a notifications page.
- **See activity** — most changes (creating/editing items) are broadcast to all members except the person who made them.
- **See "since last visit"** — the home dashboard surfaces what happened since the member last opened hearth.
- **@mention someone** — typing `@username` or `@Display Name` in notes notifies that member specifically.
- **Manage notifications** — mark read, mark all read, delete, and clear read notifications (opening a notification marks it read and navigates to the related record).

The app supports **themes** per user (`default`, `warm`, `dark`, `gamer`), settable in Settings.

---

## 10. Attachments (photos & documents)

The household can attach files to records — mostly photos, and PDFs (like manuals/warranties) on some record types.

**What a user can do:**
- **Attach photos** to restaurants, projects, metric entries, inventory items, maintenance records, and home spaces.
- **Attach PDF documents** to inventory items, projects, maintenance records, and home spaces (not to restaurants or metric entries).
- **Upload up to 10 files per record**, each up to a size limit (images ~10 MB, documents ~25 MB).
- **Remove attachments** (the creator or an admin).
- Attachments are served from a private URL that respects the household's login.

---

## 11. Admin & user management

A small admin area for the household instance.

**What an admin can do:**
- **Users page** (`/admin/users`):
  - **Create user accounts** (username, password, display name, role).
  - **Reset passwords**.
  - **Disable / re-enable users**.
  - **Promote / demote admins**.
  - Guardrails prevent disabling or demoting the **last remaining admin**.
- **API tokens page** (`/admin/api-tokens`):
  - **Create and revoke** bearer API tokens for programmatic access to the REST API.
  - Tokens are named and scoped to a user; they're shown only once on creation.

**Non-admin members** see Settings (theme, change password) and their own notifications, but not the admin area.

---

## 12. Programmatic REST API

Beyond the web UI, hearth exposes a **read/write HTTP API** under `/api/v1` for automation and integration, authenticated with API bearer tokens.

- **Auth:** `Authorization: Bearer <token>` (tokens created in Admin → API tokens, or via the `auth:create-token` CLI).
- **Resources:** restaurants, projects (including components), metrics (including entries), inventory (including tags, types, and per-item maintenance reminders), maintenance (including categories), and home spaces.
- **List pagination** via cursor (`nextCursor`), with `limit` controls.
- **Self-describing:** `/api/openapi.json` returns an OpenAPI document, and `/api/docs` renders the API reference.
- **Import/export:** `/api/inventory/export` and `/api/inventory/import` let you back up or restore the full inventory catalog.
- **Attachments:** `/api/attachments` uploads and serves files.
- **Health:** `/api/health` is a public liveness check.

---

## 13. Access model

- **Accounts are created by an admin** — there is no self-service registration.
- **Two login modes**:
  - `required` (default): members must log in; a session cookie (30 days) keeps them signed in.
  - `open` (optional, for a trusted private network): no login required, but the app acts as a configured `OPEN_MODE_USERNAME` user. Open mode does not grant admin.
- **Roles:** `member` and `admin`. Admins manage users and API tokens.
- **First admin bootstrap:** the `auth:bootstrap` script creates the initial admin account on first setup (it refuses if users already exist).

---

## 14. What the app deliberately does NOT do

To scope a rebuild or comparison, these are explicitly out of scope in hearth today:

- **No multi-household / multi-tenant** — one household per instance.
- **No self-service registration** — admins create accounts.
- **No push notifications, email digests, or SMS.**
- **No Maps/integrations** — restaurant addresses are plain text.
- **No mobile native apps** — responsive web only.
- **No project management workflows** — projects are gentle lists with status, not pipelines/kanban with deadlines.
- **No destructive "state colors"** — design language uses marks (strike-through) and a single accent, not a rainbow of status colors.

---

## How to use this guide

- To understand **what the app does**, read this document.
- To understand **how it's built** (schema, routes, actions, API contract), read [CURRENT_STATE.md](./CURRENT_STATE.md).
- To understand **the design intent and visual language**, read [DESIGN.md](../../DESIGN.md) and [PRODUCT.md](../../PRODUCT.md) (note these describe intent, not necessarily the built state).
