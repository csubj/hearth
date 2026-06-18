---
doc: notifications
project: hearth
version: 1
status: decided
last_updated: 2026-06-14
related:
  - docs/design/00_init.md
  - docs/design/03_schema.md
  - docs/design/04_routes.md
---

# Notifications & @-Mentions

Structured reference for agents and contributors. Product behavior in `00_init.md` (Notifications); schema in `03_schema.md`.

**Model:** in-app activity stream per user — no push, email, or SMS in v1.

---

## Notification types

| Type                     | When emitted                       | Recipients                                               |
| ------------------------ | ---------------------------------- | -------------------------------------------------------- |
| `stream.created`         | New stream entry                   | All users except actor                                   |
| `stream.updated`         | Body/metadata edit                 | All except actor                                         |
| `stream.done`            | Entry marked done                  | All except actor                                         |
| `restaurant.created`     | New restaurant                     | All except actor                                         |
| `restaurant.visited`     | Marked visited / rated             | All except actor                                         |
| `project.created`        | New project                        | All except actor                                         |
| `project.status_changed` | Status update                      | All except actor                                         |
| `metric.entry_added`     | New metric entry                  | All except actor                                         |
| `inventory.created`      | New inventory item                 | All except actor                                         |
| `inventory.updated`      | Inventory item edit                | All except actor                                         |
| `metric.reminder`        | Metric overdue for logging         | Whole household or assigned user (see `reminder_recipient_user_id`) |
| `inventory.maintenance_reminder` | Maintenance reminder due   | Whole household or assigned user                         |
| `mention`                | @-mention parsed in any text field | Mentioned user(s) always; plus standard fan-out optional |
| `user.admin_action`      | Admin create/disable/reset user    | All admins except actor (audit)                          |

---

## Fan-out rules

Default: **household broadcast minus actor** — everyone else gets a notification row so anyone can catch up on household activity.

Exceptions:

- **`mention`:** always creates a row for each `mentioned_user_id`, even if they are the actor (edge case: self-mention ignored)
- **`user.admin_action`:** admins only
- Actor never receives their own routine CRUD notification (they were there)

Implementation: `emitNotification({ type, actorId, entityType, entityId, summary, extraRecipients? })` in `src/lib/notifications/emit.ts`.

---

## Summary text

Pre-rendered string stored in `notifications.summary` for stable feed display without joining entity tables at read time.

Templates (actor display name interpolated):

| Type                     | Template example                                 |
| ------------------------ | ------------------------------------------------ |
| `stream.created`         | `{actor} added a stream note`                    |
| `stream.done`            | `{actor} marked a stream note done`              |
| `restaurant.created`     | `{actor} added {restaurant.name}`                |
| `restaurant.visited`     | `{actor} visited {restaurant.name}`              |
| `project.status_changed` | `{actor} moved "{project.title}" to In progress` |
| `metric.entry_added`     | `{actor} logged {value} for {metric.name}`       |
| `inventory.created`      | `{actor} added {inventory_item.name} to inventory` |
| `inventory.updated`      | `{actor} updated {inventory_item.name}`          |
| `mention`                | `{actor} mentioned you in a stream note`         |
| `user.admin_action`      | `{actor} created user @{username}`               |

Include enough context to scan; full detail on click-through to entity route.

---

## Read state

| Mechanism               | Use                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `notifications.read_at` | Per-notification read timestamp                                                          |
| `users.last_seen_at`    | Updated on authenticated layout load; drives home "since you last visited" and nav badge |

**Badge count:** `COUNT(*) WHERE recipient = currentUser AND read_at IS NULL`.

**Mark read:** single notification or "mark all read" on `/notifications` page via server actions.

Unread mentions styled prominently (bold or accent dot) in the feed.

---

## @-Mentions

### Syntax

- Token: `@` followed by a mention key matching **username** (case-insensitive) or **display name** (case-insensitive, spaces → underscore in UI picker only)
- Stored in body as plain text: `@alex` or `@Alex`
- Invalid mentions (unknown user) left as literal text; no notification

### Parse pipeline

On create/update of any text field that supports mentions:

1. Run `parseMentions(body, activeUsers)` → list of `userId`
2. Replace `mentions` rows for that entity (delete old, insert new)
3. Emit `mention` notification per newly mentioned user (dedupe against previous version on edit)

Parser lives in `src/lib/mentions/parse.ts`. Unit test edge cases: punctuation after mention, multiple mentions, edit removing mention.

### Autocomplete (UI)

- Client component: Popover on `@` keystroke
- Source: active users (`disabled_at IS NULL`) from server props or lightweight API
- Insert `@username` on select (username is canonical in stored text)

Fields supporting mentions in v1:

- `stream_entries.body`
- `restaurants.notes`, `restaurants.visit_note`
- `projects.description`
- `metric_entries.note`
- `inventory_items.notes`

---

## Click-through

Map `(entity_type, entity_id)` → route:

| entity_type                 | Route                                    |
| --------------------------- | ---------------------------------------- |
| `stream_entry`              | `/stream#entry-{id}` or scroll via query |
| `restaurant`                | `/restaurants/[id]`                      |
| `project`                   | `/projects/[id]`                         |
| `metric` / `metric_entry`   | `/metrics/[metricId]`                    |
| `inventory_item`            | `/inventory/[id]`                        |

Notification row click marks read and navigates.

---

## Home page integration

Optional compact block: "Since you last visited" — notifications where `created_at > user.last_seen_at`, limit 3, link to `/notifications`.

Do not block home render on notification writes.

---

## Emitter integration

Every mutating server action in `src/lib/actions/*` calls the emitter after successful DB write:

```typescript
// pattern — not literal code
await emitHouseholdActivity({
  type: "stream.created",
  actorId: user.id,
  entityType: "stream_entry",
  entityId: entry.id,
  summary: `${displayName(user)} added a stream note`,
});
await emitMentions({ body, entityType, entityId, actorId: user.id });
```

Keep emitter side-effect isolated — failures log but do not roll back primary mutation in v1 (eventual consistency acceptable for a household app).

---

## Testing

- Fan-out excludes actor
- Mention creates row for mentioned user only (+ mention type)
- Edit removes stale mention rows
- markAllRead clears badge count
- Self-mention ignored

---

## Notifications summary (machine-readable)

```yaml
notifications:
  delivery: in_app_only
  table: notifications
  fan_out: household_minus_actor
  read_state: [read_at, last_seen_at]
  mentions:
    syntax: "@username"
    table: mentions
    autocomplete: true
  routes:
    page: /notifications
    actions: [markRead, markAllRead]
  types:
    - stream.created
    - stream.updated
    - stream.done
    - restaurant.created
    - restaurant.visited
    - project.created
    - project.status_changed
    - metric.entry_added
    - inventory.created
    - inventory.updated
    - mention
    - user.admin_action
```
