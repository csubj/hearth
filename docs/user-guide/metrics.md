# Metrics

Flexible lists for recurring or ongoing measurements and observations — pet weight, plant watering, utility readings, or anything your household wants to watch over time. Each metric collects dated entries and can be viewed as a chart.

## Viewing metrics

Go to **Metrics** (`/metrics`). The page leads with your existing metrics and their latest values, so you see what's being tracked at a glance. Open a metric (`/metrics/[id]`) to see its full history and chart.

## Adding a metric

Creating a new metric is a compact, secondary action in the header — the list of existing metrics stays the focus.

1. On **Metrics**, use the **New metric** button in the header
2. Give it a **name** — e.g. "Flora's weight"
3. Optionally set a **unit** — e.g. "lbs", "°F" (display only)

## Adding entries

Open a metric (`/metrics/[id]`) and add a dated entry:

| Field | Required | Notes |
| ----- | -------- | ----- |
| Value | Yes | Number or text |
| Recorded at | Yes | When the measurement applies |
| Note | No | Context — "after morning walk" |

Entries appear in history, newest first. The detail page shows the chart, then a table or card list of past entries below it.

## Graphing

Numeric metrics render as a **line chart** over time, so trends are visible at a glance — weight creeping up, readings holding steady, watering gaps.

- The chart is the lead element on a metric's detail page
- Points are plotted by their **recorded at** date, oldest to newest
- The unit (if set) labels the axis
- Hover a point to see its exact value, date, and note
- Metrics with non-numeric values (e.g. "watered" / "skipped") fall back to the entry list rather than a chart

Charts are powered by Recharts. See the [Styling design](../design/05_styling.md) for the chart component pattern.

## Reminders

Each metric can remind the household (or one member) when it hasn't been logged on schedule.

1. When creating or editing a metric, enable **recurring reminders**
2. Set the interval — e.g. every **7 days**
3. Choose **Whole household** or **Specific member** for who gets in-app notifications
4. Stale metrics show a **Needs update** badge on the list and home page (scoped to the assigned user when set)

Logging a new entry resets the reminder clock. While still stale, reminders repeat on the same interval.

## Home page

The home metrics section shows the **latest entry** per metric. Metrics without recent entries may be flagged if something hasn't been logged in a while.

Stale metrics also appear in the **Upcoming reminders** section on Home and on `/reminders` when a reminder interval is configured.

## Use cases

| Metric | Example entries |
| ------- | ----------------- |
| Pet weight | 42.5 lbs on Jan 15, 43.1 lbs on Jan 22 |
| Plant watering | "watered" on Mon, "skipped — rain" on Wed |
| Utility reading | 12450 kWh on the 1st of each month |

## Photos

Attach a photo to an entry — e.g. a scale reading or plant condition. See [Attachments](attachments.md).

## @-mentions

@-mention someone in an entry note. See [Notifications & @-mentions](notifications-and-mentions.md).
