# Trackers

Flexible lists for recurring or ongoing measurements and observations — pet weight, plant watering, utility readings, or anything your household wants to watch over time.

## Creating a tracker

1. Go to **Trackers** (`/trackers`)
2. Create a new tracker with a **name** — e.g. "Flora's weight"
3. Optionally set a **unit** — e.g. "lbs", "°F" (display only)

## Adding entries

Open a tracker (`/trackers/[id]`) and add a dated entry:

| Field | Required | Notes |
| ----- | -------- | ----- |
| Value | Yes | Number or text |
| Recorded at | Yes | When the measurement applies |
| Note | No | Context — "after morning walk" |

Entries appear in history, newest first. The detail page shows a table or card list of past entries.

## Home page

The home trackers section shows the **latest entry** per tracker. Trackers without recent entries may be flagged if something hasn't been logged in a while.

## Use cases

| Tracker | Example entries |
| ------- | ----------------- |
| Pet weight | 42.5 lbs on Jan 15, 43.1 lbs on Jan 22 |
| Plant watering | "watered" on Mon, "skipped — rain" on Wed |
| Utility reading | 12450 kWh on the 1st of each month |

## Photos

Attach a photo to an entry — e.g. a scale reading or plant condition. See [Attachments](attachments.md).

## @-mentions

@-mention someone in an entry note. See [Notifications & @-mentions](notifications-and-mentions.md).
