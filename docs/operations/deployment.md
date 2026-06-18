# Deployment

Deploy hearth as a single container or Node process on a VPS, home server, or PaaS.

## Hosting target

| Approach       | Notes                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| Docker Compose | Recommended — see [Docker quickstart](../getting-started/docker-quickstart.md) |
| GHCR image     | Pull `ghcr.io/<owner>/hearth:latest` — no local build                          |
| Node directly  | `pnpm build && pnpm start` with persistent `data/` directory                   |

Supported platforms: any single-container host — Hetzner, Fly.io, Railway, a home NAS, etc.

## Docker Compose (local build)

```bash
docker compose up -d --build
docker compose exec app pnpm run auth:bootstrap
```

The compose file:

- Maps port `3000`
- Mounts `hearth-data` volume at `/app/data`
- Runs migrations automatically when the Next.js server starts

## GHCR image (no local build)

1. Edit `docker-compose.ghcr.yml` — set your `ghcr.io/<owner>/hearth` image slug
2. Start:

```bash
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

3. Bootstrap admin as above

### Image tags

| Tag               | When                       |
| ----------------- | -------------------------- |
| `latest`          | Every push to `main`       |
| `sha-<short-sha>` | Specific commit            |
| `1.2.3`           | Version release (`v*` tag) |

### Package visibility

GHCR packages default to private for org repos. Set the `hearth` package to **public** for anonymous pulls, or authenticate:

```bash
docker login ghcr.io
# PAT with read:packages scope
```

## Container entrypoint

On start, the container:

1. Ensures `data/` and `data/uploads/` exist
2. Runs legacy data purge scripts (events, stream) when applicable
3. Starts the Next.js server (which applies pending migrations on startup)

Migrations are idempotent and committed in `drizzle/`.

## HTTPS

Terminate TLS at a reverse proxy or platform edge. Session cookies require `Secure` in production.

### Caddy example

```
hearth.example.com {
  reverse_proxy app:3000
}
```

### nginx example

```nginx
server {
  listen 443 ssl;
  server_name hearth.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

## Health checks

| Probe     | Endpoint                              |
| --------- | ------------------------------------- |
| Liveness  | `GET /api/health` → `200 {"ok":true}` |
| Readiness | Same                                  |

Configure Docker Compose, Fly, Railway, or your load balancer to probe `/api/health`.

## Smoke test

Verify a full deploy from a dev checkout:

```bash
pnpm smoke:docker
```

Builds, starts, bootstraps, and checks health + authenticated `/projects` access.

## Authentication mode

By default the web UI requires login (`AUTH_MODE=required`). To skip the login gate on a trusted network, set `AUTH_MODE=open` and `OPEN_MODE_USERNAME` — see [Configuration](configuration.md#authentication-modes). The REST API still requires a bearer token in every mode.

## Manual deploy checklist

- [ ] `data/` volume persisted
- [ ] Migrations applied (automatic on server start)
- [ ] First admin bootstrapped
- [ ] `AUTH_MODE` reviewed (`required` unless on a trusted network)
- [ ] HTTPS configured
- [ ] API tokens issued for any integrations — see [API reference](../reference/api.md)
- [ ] Health check passing
- [ ] Backup strategy in place — see [Backup & restore](backup-restore.md)

## CI/CD

GitHub Actions runs lint, format, typecheck, and tests on every PR. Image publishing runs on push to `main`. Deploy itself is manual in v1.

See [CI/CD design](../design/10_ci.md).
