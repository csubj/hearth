# Configuration

Environment variables for a hearth instance. Copy [.env.example](https://github.com/csubj/hearth/blob/main/.env.example) as a starting point.

Never commit `.env` to version control.

## Required variables

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `DATABASE_URL` | `file:./data/hearth.db` | SQLite database path |

## Authentication modes

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `AUTH_MODE` | `required` | Web access mode: `required` or `open` |
| `OPEN_MODE_USERNAME` | — | Required when `AUTH_MODE=open` — username of the shared identity |

### `required` mode (default)

Everyone signs in. Each write is attributed to the logged-in user. Unauthenticated requests to app pages redirect to `/login`.

### `open` mode

The login gate is skipped for everyday app pages — suited to a trusted private network (home LAN, VPN). All web reads and writes are attributed to the user named by `OPEN_MODE_USERNAME`, which must exist and be active.

**Admin routes are never open.** `/admin/users` and `/admin/api-tokens` still require a logged-in admin session.

The REST API (`/api/v1/*`) **always requires a bearer token**, regardless of `AUTH_MODE`.

Example for a trusted LAN deployment:

```bash
AUTH_MODE=open
OPEN_MODE_USERNAME=household
```

Create the `household` user via admin before enabling open mode.

## API tokens

API tokens are not environment variables. They are created and stored in the `api_tokens` database table.

| Method | How |
| ------ | --- |
| Admin UI | `/admin/api-tokens` — create, list, revoke |
| CLI | `pnpm run auth:create-token` |

Each token is shown **once** at creation. Store it securely. Send it as `Authorization: Bearer <token>` on all `/api/v1/*` requests.

Revoke compromised tokens immediately from the admin UI.

## Optional variables

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `NODE_ENV` | `development` | `production` in deployed environments |
| `PORT` | `3000` | HTTP listen port |
| `UPLOADS_DIR` | `data/uploads` | Photo and document storage root |

## Bootstrap variables

Used once for non-interactive first admin creation. Only needed on first deploy.

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `HEARTH_BOOTSTRAP_USERNAME` | For non-interactive bootstrap | First admin username |
| `HEARTH_BOOTSTRAP_PASSWORD` | For non-interactive bootstrap | First admin password |
| `HEARTH_BOOTSTRAP_DISPLAY_NAME` | No | Display name for first admin |

Example:

```bash
HEARTH_BOOTSTRAP_USERNAME=admin \
HEARTH_BOOTSTRAP_PASSWORD='your-secure-password' \
HEARTH_BOOTSTRAP_DISPLAY_NAME='Admin' \
pnpm run auth:bootstrap
```

## Database modes

| Mode | `DATABASE_URL` | Use case |
| ---- | ---------------- | -------- |
| On disk | `file:./data/hearth.db` | Local dev, Docker, production |
| In memory | `file::memory:?cache=shared` | Tests only |

Tests and CI use in-memory SQLite automatically.

## Docker Compose example

```yaml
environment:
  DATABASE_URL: file:/app/data/hearth.db
  AUTH_MODE: required
  NODE_ENV: production
volumes:
  - hearth-data:/app/data
```

## Cookie behavior

In production (`NODE_ENV=production`), session cookies are set with the `Secure` flag. Ensure HTTPS is terminated at your reverse proxy or platform edge.

In `open` mode, session cookies are only needed for admin login.

## Attachment limits

Configured in application code (not env vars in v1):

| Setting | Value |
| ------- | ----- |
| Max image size | 10 MB |
| Max document size (inventory PDFs) | 25 MB |
| Max files per item | 10 |
| Image types | JPEG, PNG, WebP, GIF |
| Document types (inventory only) | PDF |

See [Attachments design](../design/07_attachments.md) for the per-entity mime policy.

## Inventory import/export

Bulk inventory operations:

| Endpoint | Method | Purpose |
| -------- | ------ | ------- |
| `/api/inventory/export` | GET | Download all inventory as JSON |
| `/api/inventory/import` | POST | Upload JSON matching export format |

File attachments are not inlined in the export — include `data/uploads/` in backups for a full restore.
