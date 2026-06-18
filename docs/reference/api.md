# API reference

hearth ships a **REST API** under `/api/v1/*` for programmatic access to every feature area, alongside the web UI's server actions. The browser app continues to use [server actions](../design/04_routes.md) for its own mutations; the REST API is an additional surface for scripts, integrations, automations, and import/export.

A live, machine-readable description is always available:

| Surface | URL |
| ------- | --- |
| OpenAPI spec (JSON) | `GET /api/openapi.json` |
| Interactive docs UI | `/api/docs` |

See [OpenAPI & interactive docs](openapi.md) for how the spec is generated and served.

## Authentication

Every `/api/v1/*` request requires a **bearer token**, regardless of the instance's web [auth mode](../operations/configuration.md). Even when the web UI runs in `open` mode (no login gate), the REST API still requires a token.

Send the token in the `Authorization` header:

```bash
curl https://your-hearth.example.com/api/v1/projects \
  -H "Authorization: Bearer hearth_pat_xxxxxxxxxxxxxxxxxxxx"
```

Tokens are created and revoked from **Admin → API tokens** (`/admin/api-tokens`) or via a CLI script. Each token is tied to a user; writes made through the API are attributed to that user. The full token value is shown **once** at creation time — store it securely. See the [Configuration guide](../operations/configuration.md) for token management notes.

| Header | Required | Value |
| ------ | -------- | ----- |
| `Authorization` | Yes | `Bearer <token>` |
| `Content-Type` | For writes | `application/json` |

## Resources

The API exposes the same entities as the web app. Each resource supports standard list/read/create/update/delete operations (subject to its own field rules).

| Resource | Base path | Notes |
| -------- | --------- | ----- |
| Restaurants | `/api/v1/restaurants` | Wishlist + visit status, ratings |
| Projects | `/api/v1/projects` | Notes, priority, status, tags (via UI), budget rollups on GET |
| Project components | `/api/v1/projects/{id}/components` | Budget line items (items, labor, fees) |
| Metrics | `/api/v1/metrics` | Named metrics; optional `reminderIntervalCount`, `reminderIntervalUnit`, `reminderRecipientUserId` |
| Metric entries | `/api/v1/metrics/{id}/entries` | Dated values for a metric |
| Inventory | `/api/v1/inventory` | Household objects/appliances/electronics |
| Inventory maintenance reminders | `/api/v1/inventory/{id}/maintenance-reminders` | Per-item upkeep schedules; `POST …/{reminderId}/complete` marks done |

### Managed types

Some resources have configurable "types" that are themselves manageable over the API:

| Type | Base path | Used by |
| ---- | --------- | ------- |
| Metric definitions | `/api/v1/metrics` | The metric (name, unit) that entries belong to |
| Inventory item types | `/api/v1/inventory/types` | Categorize inventory items (e.g. appliance, electronics) |
| Inventory tags | `/api/v1/inventory/tags` | Searchable tags applied to inventory items |

### Inventory import / export

Bulk operations for the [Inventory](../user-guide/inventory.md) feature:

| Operation | Endpoint |
| --------- | -------- |
| Export all inventory | `GET /api/inventory/export` |
| Import inventory | `POST /api/inventory/import` |

Export returns a structured file (items, links, tags, maintenance reminders) suitable for backup or migration; import accepts the same shape. Allowed import/upload file types are documented in [Configuration](../operations/configuration.md).

> **Authentication:** Unlike the `/api/v1/*` resources, these routes live outside the versioned REST surface and authenticate with a **logged-in web session cookie**, not an API bearer token. They are intended for the web UI's import/export buttons rather than token-based scripts. On failure they return `401` with a `{ "error": "Unauthorized" }` body; a failed import returns `400` with `{ "error": "<message>" }`.

## Example requests

List projects:

```bash
curl https://your-hearth.example.com/api/v1/projects \
  -H "Authorization: Bearer $HEARTH_TOKEN"
```

Create a metric entry:

```bash
curl -X POST https://your-hearth.example.com/api/v1/metrics/$METRIC_ID/entries \
  -H "Authorization: Bearer $HEARTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "value": "42.5", "recordedAt": "2026-01-15T09:30:00Z", "note": "after morning walk" }'
```

Add an inventory item:

```bash
curl -X POST https://your-hearth.example.com/api/v1/inventory \
  -H "Authorization: Bearer $HEARTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Washer", "model": "WF45", "serial": "ABC123", "location": "basement" }'
```

Get a project with budget rollups (`estimatedCostCents`, `acquiredCostCents`, `remainingCostCents`):

```bash
curl https://your-hearth.example.com/api/v1/projects/$PROJECT_ID \
  -H "Authorization: Bearer $HEARTH_TOKEN"
```

Add a budget component:

```bash
curl -X POST https://your-hearth.example.com/api/v1/projects/$PROJECT_ID/components \
  -H "Authorization: Bearer $HEARTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Gate latch",
    "kind": "item",
    "quantity": 1,
    "unitCostCents": 2499,
    "purchaseUrl": "https://example.com/latch",
    "note": "Pick up at hardware store"
  }'
```

## Pagination

List endpoints are paginated. Pass `limit` and `cursor` as query parameters; the response includes a cursor for the next page.

| Parameter | Default | Notes |
| --------- | ------- | ----- |
| `limit` | `50` | Max items per page (capped server-side) |
| `cursor` | — | Opaque cursor from a previous response's `nextCursor` |

```json
{
  "data": [ /* ...items... */ ],
  "nextCursor": "opaque-cursor-or-null"
}
```

When `nextCursor` is `null`, there are no more pages.

## Error model

Errors use standard HTTP status codes and a consistent JSON body:

```json
{
  "error": {
    "code": "validation_error",
    "message": "value is required",
    "details": [
      { "path": "value", "message": "Required" }
    ]
  }
}
```

| Status | Code | Meaning |
| ------ | ---- | ------- |
| `400` | `validation_error` | Body or query failed validation |
| `401` | `unauthorized` | Missing or invalid bearer token |
| `403` | `forbidden` | Token lacks permission (e.g. admin-only route) |
| `404` | `not_found` | Resource does not exist |
| `409` | `conflict` | Unique constraint or state conflict |
| `500` | `internal_error` | Unexpected server error |

`details` is present for validation failures and mirrors the Zod issue paths.

## Non-REST API routes

A few API routes exist outside the versioned REST surface:

### `GET /api/health`

Liveness and readiness probe. Public — no authentication required.

```json
{ "ok": true }
```

Used by Docker Compose health checks, deployment smoke tests, and uptime monitoring.

### `POST /api/attachments`

Upload a photo or document attached to an existing entity.

**Authentication:** Required — **logged-in web session cookie only**. The attachment routes do not accept an API bearer token; they are used by the web UI.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `file` | File | Yes | Image (all entities) or document (inventory only) — see [Attachments](../user-guide/attachments.md) |
| `entityType` | string | Yes | `restaurant`, `project`, `metric_entry`, or `inventory_item` |
| `entityId` | string | Yes | UUID of the parent entity |

```json
{
  "id": "uuid",
  "url": "/api/attachments/uuid"
}
```

| Status | Cause |
| ------ | ----- |
| `401` | Not authenticated |
| `400` | Missing fields, invalid form data, or empty file |
| `404` | Parent entity not found |
| `409` | An identical attachment already exists |
| `413` | File exceeds size limit |
| `415` | Unsupported or disallowed file type |

### `GET /api/attachments/[id]`

Serve an attached file.

**Authentication:** Required — logged-in web session cookie only.

**Response:** File bytes with appropriate `Content-Type` and `Cache-Control: private, max-age=3600`.

| Status | Cause |
| ------ | ----- |
| `401` | Not authenticated |
| `404` | Attachment not found |

### `DELETE /api/attachments/[id]`

Delete an attachment. Allowed for the uploader or an admin.

**Authentication:** Required — logged-in web session cookie only.

```json
{ "ok": true }
```

| Status | Cause |
| ------ | ----- |
| `401` | Not authenticated |
| `403` | Not the uploader and not an admin |
| `404` | Attachment not found |

## Web UI mutations (server actions)

The browser app still performs its own writes through Next.js **server actions** in `src/lib/actions/` rather than calling the REST API. This keeps the UI colocated and progressively enhanced. The REST API and server actions operate on the same data and validation rules.

See [Routes & Structure](../design/04_routes.md) for the server action modules and the full route table.
