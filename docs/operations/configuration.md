# Configuration

Environment variables for a hearth instance. Copy [.env.example](https://github.com/csubj/hearth/blob/main/.env.example) as a starting point.

Never commit `.env` to version control.

## Required variables

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `DATABASE_URL` | `file:./data/hearth.db` | SQLite database path |

### Production only

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `SESSION_SECRET` | — | Session signing secret (32+ random bytes) |

Generate a session secret:

```bash
openssl rand -base64 32
```

## Optional variables

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `NODE_ENV` | `development` | `production` in deployed environments |
| `PORT` | `3000` | HTTP listen port |
| `UPLOADS_DIR` | `data/uploads` | Photo storage root (relative to project root) |

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
  SESSION_SECRET: ${SESSION_SECRET}
  NODE_ENV: production
volumes:
  - hearth-data:/app/data
```

## Cookie behavior

In production (`NODE_ENV=production`), session cookies are set with the `Secure` flag. Ensure HTTPS is terminated at your reverse proxy or platform edge.

## Attachment limits

Configured in application code (not env vars in v1):

| Setting | Value |
| ------- | ----- |
| Max file size | 10 MB |
| Max photos per item | 10 |
| Allowed types | JPEG, PNG, WebP, GIF |

See [Attachments design](../design/07_attachments.md) for implementation details.
