# Inventory

A searchable catalog of the household's physical things — appliances, electronics, tools, furniture — so details are findable when you need them: a model number for a warranty claim, the paint color in the garage, the manual for the dishwasher.

Unlike the stream, inventory is **reference data** — it changes rarely and is read often. The page leads with the searchable list, not a capture form.

## Viewing inventory

Go to **Inventory** (`/inventory`). The page opens with a search bar and your existing items. Click an item (`/inventory/[id]`) for full details — metadata, tags, links, photos, and documents.

## Searching and filtering

| Control | What it matches |
| ------- | --------------- |
| Search box | Name, brand, model, serial, location, notes |
| Tag chips | Filter by tag (e.g. kitchen, under-warranty) |
| Type filter | Filter by item type (appliance, electronics, etc.) |

Search is instant as you type. Clear filters to see the full catalog.

## Adding an item

Creating a new item is a compact action in the page header — the list stays the focus.

1. On **Inventory**, click **Add item** in the header
2. Fill in what you know — only **name** is required

| Field | Required | Notes |
| ----- | -------- | ----- |
| Name | Yes | e.g. "Washer", "Guest room paint" |
| Brand | No | Manufacturer |
| Model | No | Model number |
| Serial | No | Serial number |
| Type | No | appliance, electronics, furniture, etc. |
| Location | No | basement, garage, kitchen |
| Purchase date | No | When you bought it |
| Store | No | Where purchased |
| Price | No | Freeform — "$899" |
| Warranty | No | Expiry, claim info |
| Notes | No | Anything else |

## Tags

Tags group items flexibly — "kitchen", "needs-repair", "under-warranty". Add tags on the item detail page. Tags appear as chips on list cards and can be used as filters.

## Links

Attach labeled URLs to an item — product pages, manuals online, warranty portals, receipts stored elsewhere.

| Field | Example |
| ----- | ------- |
| Label | "Manual", "Warranty portal", "Receipt" |
| URL | `https://...` |

## Photos and documents

Inventory accepts both **photos** and **PDF documents** — manuals, receipts, warranty cards. Other features in hearth are photos-only.

1. Open the item detail page
2. Use the upload control
3. Select images (JPEG, PNG, WebP, GIF) or PDFs

Limits: 10 MB per image, 25 MB per PDF, up to 10 files per item. See [Attachments](attachments.md).

## Home page

The home inventory section shows a few recently added or edited items and a quick search link to the full catalog.

## Import and export

Bulk operations for backup, migration, or loading an existing spreadsheet:

| Operation | How |
| --------- | --- |
| Export | `GET /api/inventory/export` or export button in admin/settings (if exposed in UI) |
| Import | `POST /api/inventory/import` with JSON matching the export format |

File attachments are not included in the export JSON — back up `data/uploads/` separately for a full restore. See [Backup & restore](../operations/backup-restore.md).

The REST API also supports full CRUD at `/api/v1/inventory` — see [API reference](../reference/api.md).

## @-mentions

@-mention someone in item notes. See [Notifications & @-mentions](notifications-and-mentions.md).
