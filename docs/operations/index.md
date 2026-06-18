# Operating guide

This section is for whoever runs a hearth instance — deploying, configuring, backing up, and keeping it healthy.

## One instance, one household

hearth is designed as a **single-process, single-database** application:

- One deployment = one household
- SQLite database in `data/hearth.db`
- Photo uploads in `data/uploads/`
- No horizontal scaling in v1

## Operator checklist

| Task | Guide |
| ---- | ----- |
| Set environment variables | [Configuration](configuration.md) |
| Deploy with Docker or VPS | [Deployment](deployment.md) |
| Back up household data | [Backup & restore](backup-restore.md) |
| Upgrade to a new version | [Upgrading](upgrading.md) |
| Fix common problems | [Troubleshooting](troubleshooting.md) |

## Resource guidance

| Scale | Suggestion |
| ----- | ---------- |
| Household (2–6 users) | 512 MB–1 GB RAM, 1 vCPU |
| Disk | Grows with photos; monitor `data/` volume size |

SQLite handles this workload easily. Scale vertically if needed — do not run multiple app replicas against one database file.

## What not to do

- Do not mount SQLite over NFS or a network filesystem
- Do not run multiple containers/replicas writing one DB file
- Do not store uploads outside the persisted volume
- Do not commit `.env` or `data/` to version control

## Health monitoring

```bash
curl https://your-hearth.example.com/api/health
# {"ok":true}
```

Use this endpoint for Docker Compose health checks, load balancer probes, or uptime monitoring.

## Related docs

- [Docker quickstart](../getting-started/docker-quickstart.md) — fastest path to a running instance
- [Deployment design](../design/09_deploy.md) — detailed design reference
- [Architecture overview](../architecture/index.md) — how the system fits together
