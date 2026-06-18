# Attachments

Attach photos to records across hearth — restaurant reviews, projects, metric entries, and inventory items. Inventory items and projects additionally accept **PDF documents** (manuals, receipts, warranties, quotes).

## Supported formats

### Images (all entities)

| Type | Extensions      |
| ---- | --------------- |
| JPEG | `.jpg`, `.jpeg` |
| PNG  | `.png`          |
| WebP | `.webp`         |
| GIF  | `.gif`          |

**Limits:** 10 MB per image, up to 10 files per item.

### Documents (inventory & projects)

| Type | Extensions |
| ---- | ---------- |
| PDF  | `.pdf`     |

**Limits:** 25 MB per document, counted toward the 10-file-per-item limit.

## Uploading files

1. Open the detail page or edit form for an item
2. Use the upload control
3. Select images (or PDFs on inventory items and projects)

The item must exist before you can attach files — create the entry first, then add files on edit.

## Viewing attachments

Photos appear as a thumbnail grid on detail views. Click a thumbnail to open a full-size lightbox. PDFs show a document icon with filename — click to download or open.

## Security

Files are stored on the hearth instance (not external hosting). Access requires login (or a valid API token for programmatic access) — URLs are not publicly shareable.

## Storage location

On the server, files live in `data/uploads/` alongside the SQLite database. Operators should include this directory in backups — see [Backup & restore](../operations/backup-restore.md).

## Removing attachments

Delete individual attachments from the detail page. Removing a file deletes it from storage.

!!! note
Deleting a parent item (e.g. a restaurant) does not automatically delete attached files in v1. Orphan cleanup may be added later.
