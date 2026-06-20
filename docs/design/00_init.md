# hearth

hearth is a landing page for coordination between people in a household. Like a refrigerator door or a kitchen whiteboard, it holds shared information everyone can see at a glance — what needs attention now, what we're planning for later, and notes we don't want to lose.

It is not a task manager in the corporate sense. It is a shared surface for the small, ongoing things that make up domestic life: errands half-remembered, restaurants someone mentioned, a house project stalled in the garage, Flora's weight from last week, a vet appointment on Saturday we might forget.

---

## Who it's for

A small household — partners, roommates, or family — who already coordinate informally through texts, scraps of paper, and mental notes. hearth replaces the scattered version with one place that everyone trusts as current.

There is no audience beyond the household. No public profiles, no social feed, no growth metrics. The product succeeds when opening it feels like walking into the kitchen and seeing what's on the board.

---

## Design principles

**Glanceable first.** The home page should answer "what's going on?" in a few seconds. Detail lives one click deeper; the landing view stays calm.

**Show what exists first.** Every page leads with what's already there — the list, the history, the items. Adding something new is a deliberate, secondary affordance (a compact "Add" button or an expandable form near the header), never the first element in view. People open hearth to _see_ what's on the board, not to fill out a form.

**Low friction to capture.** When someone does want to add a thought, it should be as easy as writing on a sticky note — capture sits one tap away, behind the content rather than in front of it. Stream-of-consciousness entries don't need categories or due dates unless someone chooses to add them later. @-mentions are optional and lightweight — a nudge, not an assignment system.

**Shared by default.** Everything in hearth is visible to everyone in the household. Private notes belong elsewhere.

**Gentle structure.** Features are organized as lists and maps, not workflows. Items can sit idle for months without feeling "overdue" or broken.

**Feels like home, not work.** Copy, layout, and interaction should be warm and informal — closer to a family notebook than a project management tool.

---

## Features

### Shared stream of consciousness

> **Implementation note:** the standalone stream was built and later merged into **House projects** (migration `0007_projects_v2_drop_stream.sql`); there is no separate `/stream` feature in the current code. The vision below is retained for context.

A running list of tasks, reminders, and half-formed thoughts anyone can add to.

- Quick capture: type and save; no required fields beyond the note itself
- Optional metadata later: mark done, pin for attention, add a rough "when" if helpful, @-mention a household member
- Chronological by default, with pinned or active items surfaced on the home page
- Examples: "pick up more dog food," "call about the water heater," "remember to bring the crock pot to Sarah's"

This is the catch-all layer. If something doesn't fit a specialized list yet, it lives here.

### Restaurants to try

A shared wishlist of places to eat.

**v1:** list only — name, optional address or neighborhood, who suggested it, and notes.

- Add a restaurant by name and optional location text; tag with who suggested it or why ("Emily said the pasta is great")
- Status: want to try → visited
- After a visit: 1–5 star rating plus a short note ("get the lamb, skip the appetizer")
- Filter and sort by neighborhood, rating, or who added it

**Later:** map view using Google Maps (free tier) — browse by pin, plan outings by proximity.

Over time this becomes a household food journal, not just a todo list.

### House projects

A list of things to fix, build, or improve around the home.

- Title, optional description, and rough status (idea → in progress → done)
- Notes for materials, links, or steps without forcing a formal project plan
- Examples: "fix the back gate latch," "paint the guest room," "organize the garage shelves"

Projects can linger. The goal is visibility, not velocity.

### Metrics

Flexible lists for recurring or ongoing measurements and observations.

- Named metric (e.g. Flora's weight) with dated entries over time
- Simple numeric or text values; optional note per entry
- **Chart view:** numeric metrics render as a line/point graph over time so trends are visible at a glance; a table view backs it up when exact values matter
- Same pattern works for anything the household wants to watch: plant watering, medication schedules, utility readings

Start with one concrete use case; generalize the pattern as needed.

### Inventory

A searchable catalog of the household's physical things — appliances, electronics, tools, furniture — so details are findable when you actually need them: a model number for a warranty claim, the paint color in the garage, the manual for the dishwasher.

- Item record: name, brand, model, serial number, item type, location, purchase date, store, price, warranty notes, and free-form notes
- **Tags** for flexible grouping ("kitchen", "needs-repair", "under-warranty") and **links** (label + URL) for manuals, product pages, or receipts
- **Photos and documents:** attach pictures of the item plus PDFs, manuals, and receipts — inventory is the one place documents are allowed, not just images
- **Search** across name, brand, model, serial, location, and notes; filter by tag or type
- **Import/export:** bulk-load an existing spreadsheet and export the catalog for backup or a move

Unlike the stream, inventory is reference data — it changes rarely and is read often. The page leads with the searchable list, not a capture box.

### House maintenance

A log of maintenance and changes to the home — services, repairs, warranties, and follow-ups — separate from inventory item upkeep schedules.

- **Maintenance log:** title, notes, category (free-text, e.g. HVAC, Plumbing), company/contractor, cost, started/completed dates
- **Follow-up reminders:** recurring intervals (e.g. every 6 months) or one-time due dates; surfaced on `/reminders` and the home dashboard
- **Tags and links** for search and reference (manuals, invoices, vendor pages)
- **Related projects and inventory items** — link a log to a house project or a specific appliance
- **Attachments:** photos and PDFs (receipts, warranties, work orders)
- **Search and filter** by category, tag, company, or text

This complements **inventory item maintenance reminders** (recurring upkeep tied to a catalog item). House maintenance logs track work on the home itself.

---

## Home page (concept)

The landing page aggregates what needs attention across all features:

| Area        | What surfaces                                                       |
| ----------- | ------------------------------------------------------------------- |
| Stream      | Recent additions, pinned items, things marked active                |
| Restaurants | A few "want to try" suggestions (v1: list; later: nearby on map)    |
| Projects    | Items in progress or recently touched                               |
| Metrics     | Latest entry or reminder if something hasn't been logged in a while |
| Inventory   | Quick search box; a few recently added or edited items              |
| Maintenance | Recent logs; follow-up reminders due                                |

Each section links to its full view. The page should feel like a summary, not a dashboard with widgets.

---

## Users & access

Each hearth instance serves **one household**. There is no multi-tenant signup flow or household picker — the instance _is_ the household.

- Users log in with a username and password
- The **instance admin** creates accounts, sets or resets passwords, and removes users
- No self-service registration; new members are added by the admin
- All authenticated users see the same shared data

### Access modes

hearth runs in one of two web access modes, chosen per instance:

- **Required (default):** everyone signs in; each write is attributed to the logged-in user.
- **Open:** the login gate is skipped — suited to a trusted private network — and web activity is attributed to a single shared household identity. Admin pages still require a logged-in admin.

Regardless of mode, the [programmatic API](#programmatic-api) always requires its own token. Authentication implementation details, including the `AUTH_MODE` setting: see `02_auth.md`.

---

## Notifications

A **notification stream** gives each user a chronological log of activity across hearth — not push alerts (for now), but a place to catch up on what changed while they were away.

- Entries when items are added, edited, or completed
- @-mentions surface here prominently so the mentioned user can find them
- Shows who did what and when (e.g. "Alex added a restaurant," "Jordan @-mentioned you in the stream")
- Accessible from the main nav; optionally summarized on the home page ("since you last visited")

Push notifications and email digests are out of scope for v1; the in-app stream is the first delivery mechanism.

---

## Attachments

Photos can be attached to notes and other user inputs across features.

- Stream entries, restaurant reviews, project updates, metric notes — anywhere freeform text appears
- Multiple photos per entry when useful (e.g. before/after for a house project, menu pics after a restaurant visit)
- **Inventory items** additionally accept documents (PDFs, manuals, receipts), not just images — see `07_attachments.md` for the per-entity file policy
- Stored as part of the instance; no external photo hosting required for v1

---

## Programmatic API

hearth exposes a small REST API so the household can manage its data outside the web UI — scripts, home-automation glue, bulk edits, or a future companion app.

- Every resource the UI manages is reachable over REST under `/api/v1/` — restaurants, projects, metrics (and their definitions), inventory (with its tags and types), and maintenance logs
- Requests authenticate with a **bearer API token**, separate from web login; tokens are created and revoked by an admin
- The API is **self-describing**: an OpenAPI spec is served at `/api/openapi.json` with interactive docs at `/api/docs`
- The web UI keeps using its own server actions; REST is an additional surface, not a replacement

Implementation details: see `02_auth.md` (API tokens) and `04_routes.md` (`/api/v1` layout).

---

## Out of scope (for now)

- Multiple households per instance, or fine-grained per-user permissions (open mode shares one identity — it is not read-only or guest access)
- Self-service user registration
- Mobile-native apps (responsive web is enough initially)
- Push notifications, email digests, or SMS reminders
- Google Maps integration (v1 restaurants are list-only; Maps on free tier comes later)
- Integrations with external calendars or smart home devices
- Hosting and deployment — see `09_deploy.md`
