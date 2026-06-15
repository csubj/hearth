# hearth

hearth is a landing page for coordination between people in a household. Like a refrigerator door or a kitchen whiteboard, it holds shared information everyone can see at a glance — what needs attention now, what we're planning for later, and notes we don't want to lose.

It is not a task manager in the corporate sense. It is a shared surface for the small, ongoing things that make up domestic life: errands half-remembered, restaurants someone mentioned, a house project stalled in the garage, Flora's weight from last week, an event on Saturday we might forget.

---

## Who it's for

A small household — partners, roommates, or family — who already coordinate informally through texts, scraps of paper, and mental notes. hearth replaces the scattered version with one place that everyone trusts as current.

There is no audience beyond the household. No public profiles, no social feed, no growth metrics. The product succeeds when opening it feels like walking into the kitchen and seeing what's on the board.

---

## Design principles

**Glanceable first.** The home page should answer "what's going on?" in a few seconds. Detail lives one click deeper; the landing view stays calm.

**Low friction to capture.** Adding a thought should be as easy as writing on a sticky note. Stream-of-consciousness entries don't need categories or due dates unless someone chooses to add them later. @-mentions are optional and lightweight — a nudge, not an assignment system.

**Shared by default.** Everything in hearth is visible to everyone in the household. Private notes belong elsewhere.

**Gentle structure.** Features are organized as lists and maps, not workflows. Items can sit idle for months without feeling "overdue" or broken.

**Feels like home, not work.** Copy, layout, and interaction should be warm and informal — closer to a family notebook than a project management tool.

---

## Features

### Shared stream of consciousness

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

### Other trackers

Flexible lists for recurring or ongoing measurements and observations.

- Named tracker (e.g. Flora's weight) with dated entries over time
- Simple numeric or text values; optional note per entry
- Lightweight chart or table view when history matters
- Same pattern works for anything the household wants to watch: plant watering, medication schedules, utility readings

Start with one concrete use case; generalize the pattern as needed.

### Events

A date-ordered list of things to go to or remember by calendar date.

- Event name, date (and optional time), location, link, or short note
- Sorted chronologically; past events archive or fade rather than clutter the present
- Examples: "concert at the park — June 21," "vet appointment — next Tuesday 3pm," "block party"

Complements the stream-of-consciousness list for anything that is inherently tied to a specific day.

---

## Home page (concept)

The landing page aggregates what needs attention across all features:

| Area | What surfaces |
|------|----------------|
| Stream | Recent additions, pinned items, things marked active |
| Restaurants | A few "want to try" suggestions (v1: list; later: nearby on map) |
| Projects | Items in progress or recently touched |
| Trackers | Latest entry or reminder if something hasn't been logged in a while |
| Events | Upcoming within the next week or two |

Each section links to its full view. The page should feel like a summary, not a dashboard with widgets.

---

## Users & access

Each hearth instance serves **one household**. There is no multi-tenant signup flow or household picker — the instance *is* the household.

- Users log in with a username and password
- The **instance admin** creates accounts, sets or resets passwords, and removes users
- No self-service registration; new members are added by the admin
- All authenticated users see the same shared data

Authentication implementation details: see `02_auth.md`.

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

- Stream entries, restaurant reviews, project updates, tracker notes, event details — anywhere freeform text appears
- Multiple photos per entry when useful (e.g. before/after for a house project, menu pics after a restaurant visit)
- Stored as part of the instance; no external photo hosting required for v1

---

## Out of scope (for now)

- Multiple households per instance or guest/read-only access
- Self-service user registration
- Mobile-native apps (responsive web is enough initially)
- Push notifications, email digests, or SMS reminders
- Google Maps integration (v1 restaurants are list-only; Maps on free tier comes later)
- Integrations with external calendars or smart home devices
- Hosting and deployment — see `09_deploy.md`
