# Home Log

The **Home Log** is a reference registry for your property — a place to document the physical spaces in your home and the materials, paint colors, appliances, and equipment within them. It is not a to-do list: for upcoming work, use [Projects](projects.md) or [House Maintenance](maintenance.md). The Home Log answers _"what's in here and how is it set up?"_

---

## Getting started

Navigate to **Home Log** from the top navigation bar or **Browse → Home Log**.

The page uses a **directory tree** on the left (or a collapsible panel on mobile) and a detail pane on the right. Click any node to open it — selection follows the URL, so pages are bookmarkable.

1. Add a **property** (top-level space) with a name and optional address.
2. In the tree, expand a property and open nested **structures**, **rooms**, or **areas**.
3. Use **Sections** on a space page, or the tree’s **Materials**, **Inventory**, **Maintenance**, and **Projects** groups, to manage items and links.

Empty groups are hidden in the tree to reduce clutter. Open a space’s **Sections** panel to reach a group before the first item exists.

---

## Tree navigation

The sidebar tree mirrors your space hierarchy:

```
Property
├── Room (Kitchen)
│   ├── Materials (items in this space)
│   ├── Inventory (linked inventory items)
│   ├── Maintenance (linked maintenance logs)
│   └── Projects (linked projects)
└── Room (Bedroom)
```

- **Spaces** open the space overview (name, details, notes, attachments).
- **Group nodes** (Materials, Inventory, etc.) open that section’s list and add/link forms.
- **Material items** open the item detail page under Home Log.
- **Inventory, maintenance, and project leaves** open those records in their own areas.

On small screens, tap **Browse spaces** above the content to show or hide the tree.

---

## Spaces

A _space_ is any physical location in your home hierarchy. Spaces form a tree:

```
Property (123 Main St)
└── Structure (Main house)
    ├── Room (Kitchen)
    │   └── Area (Pantry)
    └── Room (Master bedroom)
```

| Space kind | Typical use                                            |
| ---------- | ------------------------------------------------------ |
| Property   | Top-level address — a house, cottage, or rental unit   |
| Structure  | A building on the property — main house, garage, shed  |
| Room       | A named room — kitchen, living room, bathroom          |
| Area       | A zone within a room — walk-in closet, pantry, mudroom |

### Adding a space

From **Home Log**, use the **Add property** button on the welcome page (for top-level spaces) or, from any space detail page, the **Add space** button in the **Nested spaces** panel. Each opens a pop-up dialog; the new space appears in the tree as soon as you save. You can also pick a parent in the tree and open that space first.

Fields:

- **Name** — required
- **Type** — one of the four kinds above
- **Address** — optional, shown on top-level properties only
- **Notes** — Markdown supported; @-mentions trigger notifications

### Editing and deleting

- Rename a space inline on its detail page.
- Change the type and address in **Details**.
- Edit notes in the **Notes** editor (auto-saved).
- **Delete space** removes the space and all nested spaces, items, and associated links.

---

## Items

An _item_ is a material, product, or piece of equipment attached to a space. Items belong to exactly one space.

| Item kind        | Key fields shown                             |
| ---------------- | -------------------------------------------- |
| Paint            | Color name, hex swatch, manufacturer, finish |
| Appliance        | Manufacturer, model #, serial #              |
| Electrical       | Manufacturer, model #, serial #              |
| Plumbing         | Manufacturer, model #, serial #              |
| Fixture          | Manufacturer, model #, finish                |
| Flooring         | Manufacturer, color name, finish             |
| Window treatment | Manufacturer, model #                        |
| Other (generic)  | Name, manufacturer, model #                  |

### Adding an item

Open a space, then go to **Sections → Materials** (or expand **Materials** in the tree). Use the **Add item** button to open the create dialog. Select the category first — the form shows only the fields relevant to that category.

### Paint colors

When you select **Paint** as the category:

- **Color name** — the product name (e.g., _Chantilly Lace OC-65_)
- **Hex color** — e.g., `#F5F0E8`. Accepts 3- or 6-character hex with or without `#`. The swatch is shown on item cards and the detail page.
- **Manufacturer** — e.g., _Benjamin Moore_
- **Finish** — e.g., _Eggshell_, _Satin_, _Matte_

### Attachments

Items support photos, receipts, and PDFs (up to 25 MB per file, 10 files per item). Use the **Files** section on the item detail page to upload manuals, warranty documents, or photos.

---

## Linking to maintenance, inventory, and projects

Any space or item can be linked to entries in other areas:

- Open a space and go to **Sections → Inventory**, **Maintenance**, or **Projects** (or use the matching group in the tree).
- On an item detail page, scroll to **Linked items**.
- Search for a maintenance log, inventory item, or project by name.
- Click **Link** to connect them.
- Click **Unlink** to remove the connection.

### Creating and linking in one step

Each section page (and the item detail page) also has a **New …** button that opens a create dialog. Creating a maintenance log, inventory item, or project this way automatically links the new record to the current space or item, so you can capture and connect it without leaving the Home Log.

### Back-links

When a space or item is linked to a maintenance log, inventory item, or project, the **Referenced from Home Log** panel appears on that item's detail page. This makes it easy to navigate between related records — for example, opening the maintenance log for a plumbing repair and immediately seeing which room it affects.

---

## Notes

Both spaces and items have a **Notes** section:

- Supports **Markdown** (headings, lists, links, code blocks, etc.)
- Notes auto-save while you type; you can also toggle to **Preview** mode.
- Use @-mentions to notify household members.

---

## API access

The Home Log is available via the REST API for external integrations:

| Method   | Endpoint                   | Description                                             |
| -------- | -------------------------- | ------------------------------------------------------- |
| `GET`    | `/api/v1/home/spaces`      | List spaces (pagination, `?q=`, `?kind=`, `?parentId=`) |
| `POST`   | `/api/v1/home/spaces`      | Create a space                                          |
| `GET`    | `/api/v1/home/spaces/{id}` | Get a space                                             |
| `PATCH`  | `/api/v1/home/spaces/{id}` | Update a space                                          |
| `DELETE` | `/api/v1/home/spaces/{id}` | Delete a space                                          |
| `GET`    | `/api/v1/home/items`       | List items (pagination, `?q=`, `?kind=`, `?spaceId=`)   |
| `POST`   | `/api/v1/home/items`       | Create an item                                          |
| `GET`    | `/api/v1/home/items/{id}`  | Get an item                                             |
| `PATCH`  | `/api/v1/home/items/{id}`  | Update an item                                          |
| `DELETE` | `/api/v1/home/items/{id}`  | Delete an item                                          |

All endpoints require a Bearer token. See [API reference](../reference/api.md) for details.
