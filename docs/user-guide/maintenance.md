# House maintenance

A log of maintenance and changes to your home — services, repairs, warranties, and follow-ups. This is separate from **inventory item maintenance reminders** (recurring upkeep tied to a specific catalog item).

## Where to find it

- **Browse → Maintenance** or go to `/maintenance`
- **Home** shows recent maintenance logs and follow-up reminders due
- **Reminders** (`/reminders`) includes maintenance follow-ups alongside metric and inventory reminders

## Creating a log

1. Open **Maintenance** and use **Log maintenance**
2. Enter a **title** (required) — e.g. "Annual HVAC service"
3. Optionally add **category** (HVAC, Plumbing, Roofing…), **company**, and **notes**
4. Save — you are taken to the detail page to add more metadata

## Detail page

Each maintenance log supports:

| Section                 | What you can record                              |
| ----------------------- | ------------------------------------------------ |
| **Details**             | Category, company, cost, started/completed dates |
| **Tags**                | Comma-separated labels for search                |
| **Links**               | Label + URL (invoices, vendor pages, manuals)    |
| **Notes**               | Markdown with @-mentions                         |
| **Follow-up reminders** | Recurring interval or one-time due date          |
| **Related items**       | Link to a project or inventory item              |
| **Attachments**         | Photos and PDFs (receipts, warranties)           |

## Follow-up reminders

Add reminders for work that needs checking later:

- **Recurring interval** — e.g. every 6 months after you mark done
- **One-time due date** — e.g. "re-inspect roof patch on July 15"

Reminders appear on `/reminders` and trigger in-app notifications when due. Use **Mark done** on a reminder when follow-up is complete.

## Search and filters

On the maintenance list, filter by:

- Text search (title, notes, company, category)
- **Category**, **tags**
- Sort by recently updated, recently started, recently completed, or highest cost

## vs. inventory item reminders

| Feature                      | Purpose                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| **House maintenance logs**   | Record work done on the home; track cost, vendor, documents      |
| **Inventory item reminders** | Recurring upkeep for a specific item (filter change, inspection) |

You can link a maintenance log to an inventory item when the work relates to that appliance or system.

## Notifications

Creating, updating, or deleting a log notifies other household members. @-mentions in notes notify mentioned users. Due follow-up reminders emit `maintenance.reminder` notifications.
