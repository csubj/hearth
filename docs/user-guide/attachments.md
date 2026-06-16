# Attachments

Attach photos to notes and entries across hearth — stream notes, restaurant reviews, project updates, tracker entries, and event details.

## Supported formats

| Type | Extensions |
| ---- | ---------- |
| JPEG | `.jpg`, `.jpeg` |
| PNG | `.png` |
| WebP | `.webp` |
| GIF | `.gif` |

**Limits:**

- 10 MB per file
- Up to 10 photos per item

## Uploading photos

1. Open the detail page or edit form for an item (stream entry, restaurant, project, etc.)
2. Use the photo upload control
3. Select one or more images

The item must exist before you can attach photos — create the entry first, then add images on edit.

## Viewing photos

Photos appear as a thumbnail grid on detail views. Click a thumbnail to open a full-size lightbox.

## Security

Photos are stored on the hearth instance (not external hosting). Access requires login — URLs are not publicly shareable.

## Storage location

On the server, photos live in `data/uploads/` alongside the SQLite database. Operators should include this directory in backups — see [Backup & restore](../operations/backup-restore.md).

## Removing photos

Delete individual attachments from the detail page. Removing a photo deletes the file from storage.

!!! note
    Deleting a parent item (e.g. a stream entry) does not automatically delete attached photos in v1. Orphan cleanup may be added later.
