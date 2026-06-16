# API reference

hearth uses **server actions** for most mutations. API routes exist only for health checks and file upload/serve.

All API routes except health require a valid session cookie.

## Health

### `GET /api/health`

Liveness and readiness probe. Public — no authentication required.

**Response:**

```json
{ "ok": true }
```

**Status:** `200 OK`

Used by Docker Compose health checks, deployment smoke tests, and uptime monitoring.

## Attachments

### `POST /api/attachments`

Upload a photo attached to an existing entity.

**Authentication:** Required

**Content-Type:** `multipart/form-data`

**Fields:**

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `file` | File | Yes | Image file (JPEG, PNG, WebP, GIF; max 10 MB) |
| `entityType` | string | Yes | `stream_entry`, `restaurant`, `project`, `tracker_entry`, or `event` |
| `entityId` | string | Yes | UUID of the parent entity |

**Response:**

```json
{
  "id": "uuid",
  "url": "/api/attachments/uuid"
}
```

**Errors:**

| Status | Cause |
| ------ | ----- |
| `401` | Not authenticated |
| `400` | Invalid mime, oversize, missing fields, entity not found |
| `413` | File exceeds 10 MB |

### `GET /api/attachments/[id]`

Serve an attached photo.

**Authentication:** Required

**Response:** File bytes with appropriate `Content-Type` header.

**Headers:**

```
Cache-Control: private, max-age=3600
```

**Errors:**

| Status | Cause |
| ------ | ----- |
| `401` | Not authenticated |
| `404` | Attachment not found |

## Mutations (server actions)

Feature CRUD is **not** exposed as REST APIs. Mutations go through Next.js server actions in `src/lib/actions/`:

| Module | Actions |
| ------ | ------- |
| `auth.ts` | `login`, `logout`, `changePassword` |
| `stream.ts` | `createEntry`, `updateEntry`, `togglePin`, `markDone` |
| `restaurants.ts` | `create`, `update`, `markVisited`, `setRating` |
| `projects.ts` | `create`, `update`, `setStatus` |
| `trackers.ts` | `createTracker`, `addEntry`, `updateTracker` |
| `events.ts` | `create`, `update`, `delete` |
| `notifications.ts` | `markRead`, `markAllRead` |
| `admin/users.ts` | `createUser`, `resetPassword`, `disableUser`, `enableUser`, `promoteAdmin` |

Forms post directly to these actions. See [Routes & Structure](../design/04_routes.md) for the full route table.

## Why so few API routes?

hearth follows the Next.js App Router convention: Server Components fetch data; server actions handle mutations. API routes are reserved for cases that don't fit — binary uploads and health probes.

Do not add REST CRUD endpoints for feature entities unless requirements change.
