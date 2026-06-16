# Backup & restore

hearth stores everything in the `data/` directory — SQLite database and photo uploads. Back up this directory to protect your household's data.

## What to back up

```
data/
  hearth.db       # all household content, users, sessions
  uploads/        # attached photos
```

Both must be included. The database references upload paths.

## Backup procedure

### Simple archive (app stopped)

Safest approach — stop the app to ensure a consistent snapshot:

```bash
docker compose down
tar czf hearth-backup-$(date +%Y%m%d).tar.gz data/
docker compose up -d
```

### Hot backup (app running)

For minimal downtime, use SQLite's backup API or copy while accepting brief inconsistency risk:

```bash
sqlite3 data/hearth.db ".backup 'data/hearth-backup.db'"
tar czf hearth-backup-$(date +%Y%m%d).tar.gz data/hearth.db data/uploads/
```

### Docker volume

If using the `hearth-data` Docker volume:

```bash
docker compose down
docker run --rm \
  -v hearth_hearth-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/hearth-backup-$(date +%Y%m%d).tar.gz -C /data .
docker compose up -d
```

Adjust volume name (`docker volume ls` to confirm).

## Restore procedure

```bash
docker compose down
tar xzf hearth-backup-YYYYMMDD.tar.gz
docker compose up -d
```

Verify:

```bash
curl http://localhost:3000/api/health
# log in and spot-check content
```

## Backup schedule

| Environment | Suggestion |
| ----------- | ---------- |
| Home server | Weekly automated tar + off-site copy |
| VPS | Daily cron + remote storage (S3, another machine) |
| Dev only | Optional — data is disposable |

## What backups do not include

- Environment variables (`.env`) — store `SESSION_SECRET` separately and securely
- Application code — recoverable from git/Docker image
- Git history

## Disaster recovery

1. Deploy a fresh hearth instance (same version if possible)
2. Restore `data/` from backup
3. Ensure `SESSION_SECRET` matches the original (or all users must re-login)
4. Verify health endpoint and log in

If `SESSION_SECRET` changes, existing session cookies are invalidated — users log in again but data is intact.
