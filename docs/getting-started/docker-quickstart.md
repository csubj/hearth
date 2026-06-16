# Docker quickstart

The fastest way to run hearth without installing Node.js locally. Every push to `main` publishes a Docker image to GitHub Container Registry (GHCR).

## Option A: Docker Compose (recommended)

### 1. Clone the repo

```bash
git clone https://github.com/csubj/hearth.git
cd hearth
```

### 2. Set environment variables

Create a `.env` file in the project root:

```bash
SESSION_SECRET=$(openssl rand -base64 32)
echo "SESSION_SECRET=$SESSION_SECRET" >> .env
```

### 3. Start the stack

Build locally:

```bash
docker compose up -d --build
```

Or pull the published image (edit `docker-compose.ghcr.yml` with your GitHub owner slug first):

```bash
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

### 4. Bootstrap the first admin

```bash
docker compose exec app pnpm run auth:bootstrap
```

Non-interactive:

```bash
docker compose exec \
  -e HEARTH_BOOTSTRAP_USERNAME=admin \
  -e HEARTH_BOOTSTRAP_PASSWORD='your-secure-password' \
  -e HEARTH_BOOTSTRAP_DISPLAY_NAME='Admin' \
  app pnpm run auth:bootstrap
```

### 5. Open the app

Visit [http://localhost:3000](http://localhost:3000) and sign in.

## Option B: Single `docker run`

Replace `<owner>` with your GitHub username or org (lowercase):

```bash
docker pull ghcr.io/<owner>/hearth:latest

docker run -d \
  --name hearth \
  -p 3000:3000 \
  -e DATABASE_URL=file:/app/data/hearth.db \
  -e SESSION_SECRET="$(openssl rand -base64 32)" \
  -v hearth-data:/app/data \
  ghcr.io/<owner>/hearth:latest
```

Bootstrap after the container is healthy:

```bash
docker exec hearth pnpm run auth:bootstrap
```

## Health check

```bash
curl http://localhost:3000/api/health
# {"ok":true}
```

## Persistent data

The `hearth-data` Docker volume (or bind mount to `./data`) holds:

- `hearth.db` — SQLite database
- `uploads/` — attached photos

**Do not** run multiple containers against the same volume — SQLite supports one writer.

## Image tags

| Tag | When published |
| --- | -------------- |
| `latest` | Every push to `main` |
| `sha-<short-sha>` | Commit-specific |
| `main` | Branch ref |
| `1.2.3`, `1.2` | Version tags (`v*` releases) |

## Automated smoke test

From a dev checkout with Docker running:

```bash
pnpm smoke:docker
```

This builds, starts, bootstraps a test admin, and verifies health + authenticated stream access.

## Next steps

- [First use guide](first-use.md) — set up your household
- [Deployment](../operations/deployment.md) — HTTPS, reverse proxy, VPS hosting
- [Backup & restore](../operations/backup-restore.md) — protect your data
