# Troubleshooting

Common problems when running hearth.

## Installation & startup

### `pnpm install` fails on `better-sqlite3`

**Cause:** Native module build tools missing.

**Fix:** Ensure Node 22 and build essentials are installed. On macOS: Xcode command line tools. On Linux: `build-essential`, `python3`.

### Migrations fail on startup

**Cause:** Database path not writable or migrations out of sync.

**Fix:**

```bash
mkdir -p data
pnpm start   # or restart the container — migrations run on startup
```

To apply migrations manually without starting the server:

```bash
pnpm db:migrate
```

Check `DATABASE_URL` in `.env`.

### Container exits immediately

**Fix:**

```bash
docker compose logs app
```

Common causes: missing `SESSION_SECRET`, migration failure, port 3000 already in use.

## Authentication

### Bootstrap says users already exist

**Cause:** An admin was already created.

**Fix:** Log in with existing credentials, or ask another admin to reset your password.

### Login fails with correct password

**Checks:**

- Account may be **disabled** — admin must re-enable
- Wrong username (case-sensitive storage, case-insensitive login)
- Rate limiting after repeated failures — wait and retry

### Sessions expire unexpectedly

**Cause:** `SESSION_SECRET` changed between restarts.

**Fix:** Set a stable `SESSION_SECRET` in `.env` / compose environment. Users re-login after secret change.

### Can't access `/admin/users`

**Cause:** Your account is a **member**, not **admin**.

**Fix:** Ask an existing admin to promote you.

## Application

### Health check fails

```bash
curl -v http://localhost:3000/api/health
```

If connection refused: app not running. If 500: check logs for database errors.

### Photos don't display

**Checks:**

- `data/uploads/` exists and is writable
- Volume mounted correctly in Docker (`/app/data`)
- File was under 10 MB and correct mime type
- You're logged in (photos require authentication)

### Notifications not appearing

**Checks:**

- Another user made the change (you don't notify yourself for routine actions)
- Check `/notifications` directly
- `@-mention` uses valid active username

### Blank page or 500 after login

**Fix:** Restart the app (migrations run on startup) or apply manually:

```bash
pnpm db:migrate
docker compose restart app
```

Check browser dev tools console and server logs.

## Docker

### Port 3000 in use

**Fix:** Change host mapping in `docker-compose.yml`:

```yaml
ports:
  - "3001:3000"
```

### Volume permission errors

**Fix:** Ensure the container user can write to `/app/data`. Check volume ownership:

```bash
docker compose exec app ls -la /app/data
```

### GHCR pull denied

**Fix:** Package may be private. `docker login ghcr.io` with a PAT (`read:packages`), or set package visibility to public.

## Database

### Database locked

**Cause:** Multiple processes writing one SQLite file.

**Fix:** Run only **one** hearth instance per `data/` directory. Never scale horizontally with shared SQLite.

### Corrupt database

**Fix:** Restore from backup. If no backup:

```bash
sqlite3 data/hearth.db "PRAGMA integrity_check;"
```

## Getting help

- [FAQ](../about/faq.md)
- [GitHub Issues](https://github.com/csubj/hearth/issues)
- [Architecture docs](../architecture/index.md) for design context

When filing an issue, include: hearth version/image tag, deploy method (Docker/Node), relevant logs, and steps to reproduce.
