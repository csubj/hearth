---
doc: tech-choices
project: hearth
version: 3
status: decided
last_updated: 2026-06-14
---

# Tech Choices

Structured reference for agents and contributors. Each section uses a consistent schema: **Choice**, **Role**, **Rationale**, **Conventions**, and **References**.

---

## Runtime & Package Manager

| Field           | Value                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Choice**      | Node.js + pnpm                                                                                                                                                  |
| **Role**        | JavaScript/TypeScript runtime and dependency management                                                                                                         |
| **Rationale**   | Node.js is the standard runtime for Next.js. pnpm offers fast installs, strict dependency resolution, and efficient disk usage via content-addressable storage. |
| **Conventions** | Use `pnpm` exclusively (not npm or yarn). Lockfile: `pnpm-lock.yaml`. Scripts defined in root `package.json`.                                                   |
| **References**  | https://nodejs.org · https://pnpm.io                                                                                                                            |

---

## Framework

| Field           | Value                                                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Choice**      | Next.js (App Router)                                                                                                                                                                                                        |
| **Role**        | Full-stack React framework — routing, SSR, API routes, build tooling                                                                                                                                                        |
| **Rationale**   | App Router is the current Next.js default: file-system routing under `app/`, React Server Components, streaming, and colocated layouts. Fits a modern TypeScript + React stack without extra routing libraries.             |
| **Conventions** | Use the **App Router** (`app/` directory), not the legacy Pages Router (`pages/`). Prefer Server Components by default; add `"use client"` only when client interactivity is required. API endpoints live under `app/api/`. |
| **References**  | https://nextjs.org/docs/app                                                                                                                                                                                                 |

---

## Language

| Field           | Value                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Choice**      | TypeScript                                                                                                                                                   |
| **Role**        | Static typing for application and tooling code                                                                                                               |
| **Rationale**   | Catches errors at compile time, improves editor support, and documents interfaces across React components and API boundaries. Standard pairing with Next.js. |
| **Conventions** | Strict mode enabled. Source in `.ts` / `.tsx`. Config: `tsconfig.json` at project root. No plain `.js` in `app/` or `src/` unless generated.                 |
| **References**  | https://www.typescriptlang.org                                                                                                                               |

---

## UI Library

| Field           | Value                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Choice**      | React                                                                                                                                                           |
| **Role**        | Component model and rendering                                                                                                                                   |
| **Rationale**   | Required by Next.js. Large ecosystem, familiar patterns, and first-class support in the framework toolchain.                                                    |
| **Conventions** | Functional components and hooks only. Co-locate component files with their styles/tests when added. Follow Next.js conventions for server vs client components. |
| **References**  | https://react.dev                                                                                                                                               |

---

## Component Primitives

| Field           | Value                                                                                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Choice**      | Radix UI                                                                                                                                                                                                         |
| **Role**        | Unstyled, accessible UI primitives (dialogs, dropdowns, tabs, etc.)                                                                                                                                              |
| **Rationale**   | Headless components with WAI-ARIA compliance and keyboard behavior built in. Styling stays in project control (CSS modules, Tailwind, etc.) without fighting a heavy design system.                              |
| **Conventions** | Import from `@radix-ui/react-*` packages. Wrap primitives in project-specific styled components rather than using Radix markup directly in pages. Do not add a second component library for the same primitives. |
| **References**  | https://www.radix-ui.com                                                                                                                                                                                         |

---

## Containerization

| Field           | Value                                                                                                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Choice**      | Dockerfile + Docker Compose                                                                                                                                                                                                                              |
| **Role**        | Reproducible builds and local multi-service orchestration                                                                                                                                                                                                |
| **Rationale**   | Dockerfile defines a production-like image for the Next.js app. Compose wires the app with supporting services (database, cache, etc.) for local development without manual process management.                                                          |
| **Conventions** | `Dockerfile` at repo root for the app image. `docker-compose.yml` (and optional `docker-compose.override.yml`) for local stacks. Prefer multi-stage builds for smaller production images. Document required env vars in compose files or `.env.example`. |
| **References**  | https://docs.docker.com · https://docs.docker.com/compose                                                                                                                                                                                                |

---

## Database

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Choice**      | SQLite (on-disk + in-memory)                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Role**        | Local embedded database — no separate server process                                                                                                                                                                                                                                                                                                                                                                                      |
| **Rationale**   | SQLite is file-backed, zero-config, and fast for local development. A single codebase can target a persistent file in dev/prod-like runs and an ephemeral `:memory:` database in tests. No Docker service required for the DB layer at this stage.                                                                                                                                                                                        |
| **Driver**      | `better-sqlite3` — synchronous API, strong performance, common in Node.js SQLite setups                                                                                                                                                                                                                                                                                                                                                   |
| **ORM**         | Drizzle ORM — lightweight, TypeScript-first, native SQLite support and migrations                                                                                                                                                                                                                                                                                                                                                         |
| **Conventions** | **On disk:** default path `data/hearth.db` (gitignore the `data/` directory; commit schema via Drizzle migrations in `drizzle/`). **In memory:** use SQLite URI `file::memory:?cache=shared` or `:memory:` for tests and throwaway runs. Select mode via `DATABASE_URL` env var (see `.env.example`). One shared schema for both modes — only the connection string changes. Do not add Postgres/MySQL until deployment needs justify it. |
| **References**  | https://www.sqlite.org · https://github.com/WiseLibs/better-sqlite3 · https://orm.drizzle.team                                                                                                                                                                                                                                                                                                                                            |

### Database modes (machine-readable)

```yaml
database:
  engine: sqlite
  driver: better-sqlite3
  orm: drizzle
  modes:
    disk:
      url_pattern: "file:./data/hearth.db"
      use: local dev, docker-compose, persistent local runs
    memory:
      url_pattern: "file::memory:?cache=shared"
      use: unit/integration tests, ephemeral scripts
  env_var: DATABASE_URL
```

---

## Git Hooks

| Field           | Value                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Choice**      | Lefthook                                                                                                                                                                                     |
| **Role**        | Git hook manager — installs and runs repo hooks from config                                                                                                                                  |
| **Rationale**   | Single `lefthook.yml` file is easy for humans and agents to read. Fast, language-agnostic, and works well with pnpm. Avoids scattering shell scripts across `.git/hooks/`.                   |
| **Conventions** | Config at repo root: `lefthook.yml`. After clone: `pnpm install` then `lefthook install` (or `pnpm exec lefthook install`). Hooks are version-controlled; never edit `.git/hooks/` directly. |
| **References**  | https://github.com/evilmartians/lefthook                                                                                                                                                     |

### Hooks (machine-readable)

```yaml
git_hooks:
  manager: lefthook
  config: lefthook.yml
  hooks:
    pre-commit:
      - name: lint
        tool: eslint
        scope: staged *.{js,ts,jsx,tsx,mjs,cjs}
      - name: format
        tool: prettier
        mode: check
        scope: staged *.{js,ts,jsx,tsx,mjs,cjs,json,md,yml,yaml}
      - name: typecheck
        tool: tsc
        mode: --noEmit
    commit-msg:
      - name: commitlint
        tool: "@commitlint/cli"
        format: conventional-commits
    pre-push:
      - name: test
        tool: vitest
        note: runs full test suite before push
```

| Hook         | When                      | Purpose                                                                                                |
| ------------ | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pre-commit` | Before commit is recorded | Lint, format-check, and typecheck staged files so broken code does not enter history                   |
| `commit-msg` | After message is written  | Enforce [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.) |
| `pre-push`   | Before push to remote     | Run the full Vitest suite as a last gate                                                               |

---

## Testing

| Field           | Value                                                                                                                                                                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Choice**      | Vitest                                                                                                                                                                                                                                                                                                                                  |
| **Role**        | Unit and integration test runner                                                                                                                                                                                                                                                                                                        |
| **Rationale**   | Native ESM/TypeScript support, fast watch mode, and a Jest-compatible API without the Jest overhead. Pairs naturally with Vite's toolchain and works well in Next.js projects for logic, utilities, API handlers, and component tests.                                                                                                  |
| **Conventions** | Config: `vitest.config.ts` at repo root. Test files: co-located `*.test.ts` / `*.test.tsx` or `__tests__/` directories. Scripts: `pnpm test` (single run), `pnpm test:watch` (dev loop). Use in-memory SQLite (`DATABASE_URL=file::memory:?cache=shared`) for DB integration tests. Do not add Jest or another runner alongside Vitest. |
| **References**  | https://vitest.dev                                                                                                                                                                                                                                                                                                                      |

### Testing stack (machine-readable)

```yaml
testing:
  runner: vitest
  config: vitest.config.ts
  scripts:
    test: pnpm test
    watch: pnpm test:watch
  file_patterns:
    - "*.test.ts"
    - "*.test.tsx"
  environments:
    unit: node
    component: jsdom # via vitest environment or @testing-library/react when added
  database_tests:
    mode: memory
    url: "file::memory:?cache=shared"
```

---

## Stack Summary (machine-readable)

```yaml
stack:
  runtime: nodejs
  package_manager: pnpm
  framework: nextjs
  router: app
  language: typescript
  ui: react
  components: radix-ui
  charting: recharts
  api:
    handlers: nextjs_route_handlers
    validation: zod
    openapi: "@asteasolutions/zod-to-openapi"
    docs_ui: scalar # or redoc — pick one at implementation
    spec_route: /api/openapi.json
    docs_route: /api/docs
    rest_prefix: /api/v1
  database:
    engine: sqlite
    driver: better-sqlite3
    orm: drizzle
    modes: [disk, memory]
  git_hooks: lefthook
  testing: vitest
  containers:
    - dockerfile
    - docker-compose
  auth: docs/design/02_auth.md
  styling: docs/design/05_styling.md
  schema: docs/design/03_schema.md
  deploy: docs/design/09_deploy.md
  ci: docs/design/10_ci.md
  mvp: docs/design/08_mvp.md
```

---

## API & OpenAPI

| Field           | Value                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Choice**      | Next.js Route Handlers + Zod + `@asteasolutions/zod-to-openapi` + Scalar (or Redoc)                                                                                                                   |
| **Role**        | Versioned REST API under `/api/v1/*` with a self-describing OpenAPI spec                                                                                                                              |
| **Rationale**   | Route Handlers fit the App Router stack. Zod schemas validate request/response bodies and double as OpenAPI source via `zod-to-openapi`, keeping the spec in sync with runtime validation. Scalar or Redoc provides interactive docs without maintaining a separate spec by hand. |
| **Conventions** | Handlers live under `app/api/v1/`. Shared Zod schemas in `src/lib/api/schemas/`. Register paths with the OpenAPI registry; emit spec at `GET /api/openapi.json`. Interactive UI at `/api/docs`. Bearer token auth on all `/api/v1/*` routes. Web UI continues using server actions — REST is an additional surface. |
| **References**  | `docs/design/04_routes.md` · https://zod.dev · https://github.com/asteasolutions/zod-to-openapi · https://github.com/scalar/scalar |

### API stack (machine-readable)

```yaml
api:
  rest_prefix: /api/v1
  handlers: nextjs_route_handlers
  validation: zod
  openapi_generator: "@asteasolutions/zod-to-openapi"
  spec_route: GET /api/openapi.json
  docs_route: /api/docs
  docs_ui: scalar # or redoc
  auth: bearer_token # api_tokens table
```

---

## Charting

| Field           | Value                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Choice**      | Recharts                                                                                                                                       |
| **Role**        | Line/point charts for numeric metric history on `/metrics/[id]`                                                                              |
| **Rationale**   | React-native charting library; composable with Server + Client Components. Fits the existing React/Tailwind stack without a separate charting framework. |
| **Conventions** | Chart component in `src/components/MetricChart.tsx` (client component). Numeric values only — text metrics fall back to table/list. Axis labels use the metric's `unit` field. See `05_styling.md` for layout. |
| **References**  | https://recharts.org · `docs/design/05_styling.md`                                                                                             |

---

## Styling

| Field           | Value                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Choice**      | Tailwind CSS v4 + Radix UI wrappers (see `05_styling.md`)                                                                                   |
| **Role**        | Layout, tokens, and accessible primitives                                                                                                   |
| **Rationale**   | Utility-first CSS for fast UI iteration; Radix for dialogs/menus without a heavy design system. Warm household aesthetic via CSS variables. |
| **Conventions** | Tokens in `app/globals.css`. Wrappers in `src/components/ui/`. Do not add shadcn/MUI/Chakra.                                                |
| **References**  | `docs/design/05_styling.md` · https://tailwindcss.com                                                                                       |

---

## Authentication

| Field           | Value                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Choice**      | Self-managed username/password (see `02_auth.md`)                                                                                                            |
| **Role**        | Household login, admin-managed users, server-side sessions                                                                                                   |
| **Rationale**   | Single household per instance; no OAuth or email infrastructure needed. Credentials auth with SQLite-backed sessions matches the embedded-database stack.    |
| **Conventions** | Lucia v3 + Drizzle adapter. Argon2id via `@node-rs/argon2`. Bootstrap first admin via CLI. Do not add Auth.js, Clerk, or similar unless requirements change. |
| **References**  | `docs/design/02_auth.md` · https://lucia-auth.com                                                                                                            |

---

## CI/CD

| Field           | Value                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| **Choice**      | GitHub Actions (see `10_ci.md`)                                                               |
| **Role**        | Lint, format, typecheck, test on push and PR                                                  |
| **Rationale**   | Matches local lefthook gates; standard for GitHub repos. Deploy remains manual until Phase 7. |
| **Conventions** | Workflow: `.github/workflows/ci.yml`. Test DB: in-memory SQLite.                              |
| **References**  | `docs/design/10_ci.md` · https://docs.github.com/en/actions                                   |

---

## Deployment

| Field           | Value                                                                          |
| --------------- | ------------------------------------------------------------------------------ |
| **Choice**      | Docker + single VPS/container host (see `09_deploy.md`)                        |
| **Role**        | One instance per household; persistent `data/` volume                          |
| **Rationale**   | Aligns with embedded SQLite and local photo storage.                           |
| **Conventions** | `Dockerfile`, `docker-compose.yml`, migrate on start, bootstrap admin via CLI. |
| **References**  | `docs/design/09_deploy.md`                                                     |

---

## Out of Scope (for now)

Not chosen in this document; decide if requirements change:

- Alternative styling systems (CSS modules-only, component libraries like MUI)
- Automated deploy pipelines (manual Docker deploy for v1; see `10_ci.md`)
- Postgres/MySQL, Redis, or object storage (S3)
