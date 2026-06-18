# Installation

Install hearth locally for development or to run your household instance on your own machine.

## Prerequisites

| Requirement | Version |
| ----------- | ------- |
| Node.js | 22 LTS |
| pnpm | 10.x |
| OS | macOS or Linux (SQLite via `better-sqlite3`) |

Optional for documentation:

| Requirement | Purpose |
| ----------- | ------- |
| Python 3.12+ | MkDocs local preview (`make docs-serve`) |

## Local setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/csubj/hearth.git
cd hearth
pnpm install
lefthook install
```

Or with Make:

```bash
make setup
```

### 2. Configure environment

Copy the example env file and generate a session secret:

```bash
cp .env.example .env
openssl rand -base64 32
```

Add the generated value to `.env` as `SESSION_SECRET`. See [Configuration](../operations/configuration.md) for all environment variables.

### 3. Start the dev server

Migrations run automatically on startup. Start the app:

```bash
pnpm dev
```

This creates `data/hearth.db` (gitignored) and applies all Drizzle migrations from `drizzle/` on first boot.

### 4. Create the first admin

Run once per instance — the script refuses to run if users already exist:

```bash
pnpm run auth:bootstrap
```

You'll be prompted for a username and password. See [First use guide](first-use.md) for what to do next.

Non-interactive bootstrap (useful for scripts):

```bash
HEARTH_BOOTSTRAP_USERNAME=admin \
HEARTH_BOOTSTRAP_PASSWORD='your-secure-password' \
HEARTH_BOOTSTRAP_DISPLAY_NAME='Admin' \
pnpm run auth:bootstrap
```

### 5. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with your bootstrap account.

## Production build (local)

```bash
pnpm build
pnpm start
```

## Data directory

Database and photo uploads live in `./data/`:

```
data/
  hearth.db       # SQLite database
  uploads/        # attached photos
```

This directory is gitignored. Back it up regularly — see [Backup & restore](../operations/backup-restore.md).

## Verify the install

| Check | Command / URL |
| ----- | ------------- |
| Health endpoint | `curl http://localhost:3000/api/health` → `{"ok":true}` |
| Tests | `pnpm test` |
| Lint + typecheck | `pnpm lint && pnpm typecheck` |

## Next steps

- [First use guide](first-use.md) — bootstrap, log in, add household members
- [Docker quickstart](docker-quickstart.md) — run without a local Node toolchain
- [Operating guide](../operations/index.md) — deploy to a server
