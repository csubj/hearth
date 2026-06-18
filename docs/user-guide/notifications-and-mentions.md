# Notifications & @-mentions

hearth keeps a per-user **notification stream** — a chronological log of household activity. This is not push notifications or email (those are out of scope for v1); it's a place to catch up on what changed while you were away.

## Notification feed

1. Click the **bell icon** in the nav (or go to `/notifications`)
2. Browse activity: who did what and when

**Examples:**

- "Alex added a restaurant"
- "Jordan moved a project to In progress"
- "Sam mentioned you in a project"

### Read state

- Unread notifications show a badge count on the bell icon
- Click a notification to mark it read and jump to the related item
- Use **Mark all read** to clear the badge

### Home page

An optional **Since you last visited** block on the home page summarizes recent activity based on when you last opened hearth.

## What triggers notifications

| Activity                                    | Who gets notified                    |
| ------------------------------------------- | ------------------------------------ |
| Restaurant added, visited, or rated         | Everyone except the actor            |
| Project created, status changed, or deleted | Everyone except the actor            |
| Metric entry added                          | Everyone except the actor            |
| Inventory item created or updated           | Everyone except the actor            |
| Metric or maintenance reminder due          | The household or the assigned member |
| @-mention                                   | The mentioned user (always)          |
| Admin user management                       | All other admins                     |

You do **not** receive notifications for your own routine actions — you were there.

## @-mentions

### Syntax

Type `@` followed by a username in any text field that supports mentions:

```
@alex can you pick this up?
```

Usernames are case-insensitive. Use the autocomplete popover that appears when you type `@` to pick from active household members.

### Where mentions work

- Restaurant notes and visit reviews
- Project notes
- Metric entry notes
- Inventory item notes

### What happens

When you save text with a valid `@username`:

1. The mentioned user gets a **mention** notification
2. The mention appears prominently in their feed (bold or accent styling)
3. Invalid usernames are left as plain text — no notification

### Tips

- Mentions are a **nudge**, not an assignment system
- Self-mentions are ignored
- Editing text can add or remove mentions; notifications update accordingly

## No push or email (v1)

hearth does not send push notifications, email digests, or SMS reminders. Check the in-app feed when you want to catch up.

Future delivery mechanisms are on the [roadmap](../about/roadmap.md).
