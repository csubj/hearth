---
doc: auth
project: hearth
version: 1
status: decided
last_updated: 2026-06-14
related:
  - docs/design/00_init.md
  - docs/design/01_tech.md
---

# Authentication & Users

Structured reference for agents and contributors. Product context lives in `00_init.md` (Users & access); this doc covers roles, flows, and implementation conventions.

**Model:** one household per instance. Self-managed username/password auth — no OAuth, no self-service signup, no external identity provider.

---

## Roles

| Role | Capabilities |
|------|----------------|
| **member** | Log in, read and write all household data, change own password, view notification stream |
| **admin** | Everything a member can do, plus create/disable users, reset any user's password, promote another user to admin |

There is no read-only or guest role in v1. Every authenticated user has full access to shared data.

**Invariant:** at least one active admin must exist at all times. The admin UI must block disabling or demoting the last admin.

---

## User lifecycle

| Action | Who | Notes |
|--------|-----|-------|
| Bootstrap first admin | Deploy / CLI | Created once when the instance has no users (see Bootstrap) |
| Create user | Admin | Username + initial password (+ optional display name) |
| Log in | User | Username + password → session cookie |
| Change own password | User | Requires current password |
| Reset password | Admin | Sets a new password for any user; no email flow |
| Disable user | Admin | Soft-disable: user cannot log in; historical attribution preserved |
| Re-enable user | Admin | Restores login access |
| Promote to admin | Admin | Idempotent; cannot demote self if last admin |

Usernames are unique within the instance. Display names are optional and used for @-mentions and activity attribution; default to username when unset.

---

## Passwords

| Field | Value |
|-------|-------|
| **Hashing** | Argon2id via `@node-rs/argon2` |
| **Role** | One-way password storage |
| **Rationale** | Modern default for new applications; resistant to GPU cracking. Native bindings via `@node-rs/*` perform well in Node without shipping a full compiler toolchain. |
| **Conventions** | Never store or log plaintext passwords. Hash on write (create, reset, change-password); verify on login. Tune Argon2 params via env or constants in one module — do not scatter magic numbers. |
| **References** | https://github.com/napi-rs/node-rs · https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html |

**Policy (v1):**

- Minimum length: 8 characters
- No complexity rules (length is enough for a trusted household)
- No password reset email — admin resets manually
- No "forgot password" self-service flow

---

## Sessions

| Field | Value |
|-------|-------|
| **Choice** | Server-side sessions in SQLite + httpOnly cookie |
| **Role** | Authenticate requests after login |
| **Rationale** | Fits the single-instance, embedded-SQLite stack. Sessions can be revoked immediately (disable user, logout everywhere). No JWT secret rotation or stateless tradeoffs needed at this scale. |
| **Library** | Lucia v3 with `@lucia-auth/adapter-drizzle` |
| **Conventions** | Session ID in an httpOnly, `Secure` (production), `SameSite=Lax` cookie. Validate session in Next.js middleware for protected routes and in server actions / route handlers. Invalidate all sessions for a user on disable or admin password reset. |
| **References** | https://lucia-auth.com · https://nextjs.org/docs/app/building-your-application/routing/middleware |

### Session flow

```mermaid
sequenceDiagram
  participant Browser
  participant Middleware
  participant Handler
  participant DB

  Browser->>Handler: POST /login (username, password)
  Handler->>DB: verify credentials
  Handler->>DB: create session
  Handler->>Browser: Set-Cookie (session id)

  Browser->>Middleware: GET / (with cookie)
  Middleware->>DB: validate session
  Middleware->>Handler: request + user context
  Handler->>Browser: page

  Browser->>Handler: POST /logout
  Handler->>DB: delete session
  Handler->>Browser: clear cookie
```

---

## Route protection

| Surface | Rule |
|---------|------|
| `/login` | Public; redirect to `/` if already authenticated |
| App pages (`/`, feature routes, notifications) | Require valid session |
| Admin pages (`/admin/users`, etc.) | Require session + `role = admin` |
| API routes / server actions | Check session in handler; never rely on client-side checks alone |

Unauthenticated requests to protected routes redirect to `/login` with a `returnTo` query param.

---

## Admin UI

Minimal user management under `/admin` (admin role only):

- List users: username, display name, role, active/disabled, last login (if tracked)
- Create user: username, initial password, optional display name, role (default member)
- Reset password: set new password for selected user
- Disable / re-enable toggle
- Promote to admin

No bulk import, no invitation emails. The admin copies credentials out of band (text, in person, etc.).

---

## Bootstrap

On first run, the instance has no users. The first admin is created outside the web UI:

| Field | Value |
|-------|-------|
| **Mechanism** | CLI script: `pnpm run auth:bootstrap` |
| **Input** | Username + password via prompts, or env vars for non-interactive deploy |
| **Guard** | Script refuses to run if any user already exists |

Env vars for non-interactive bootstrap (document in `.env.example`):

```bash
HEARTH_BOOTSTRAP_USERNAME=
HEARTH_BOOTSTRAP_PASSWORD=
HEARTH_BOOTSTRAP_DISPLAY_NAME=  # optional
```

After bootstrap, all further user management goes through the admin UI.

---

## Database schema (conceptual)

Tables managed via Drizzle migrations alongside the rest of the app schema:

```yaml
users:
  id: uuid or text primary key
  username: text unique not null
  display_name: text nullable
  password_hash: text not null
  role: enum [member, admin] default member
  disabled_at: timestamp nullable
  created_at: timestamp not null
  updated_at: timestamp not null

sessions:
  id: text primary key
  user_id: foreign key -> users.id
  expires_at: timestamp not null
  # lucia may add additional columns per adapter docs
```

Lucia's Drizzle adapter defines exact session table shape — follow upstream schema when implementing.

**Attribution:** content tables (stream entries, restaurants, etc.) store `created_by_user_id` / `updated_by_user_id` for notifications and @-mentions. Use display name at render time, not denormalized strings.

---

## Environment variables

```yaml
auth:
  session_cookie_name: hearth_session  # default; override if needed
  session_ttl_days: 30                   # sliding or absolute — pick one in implementation
  bootstrap:
    username: HEARTH_BOOTSTRAP_USERNAME
    password: HEARTH_BOOTSTRAP_PASSWORD
    display_name: HEARTH_BOOTSTRAP_DISPLAY_NAME
  secrets:
    # Lucia / cookie signing — required in production
    session_secret: SESSION_SECRET
```

`SESSION_SECRET` must be a long random string in production. Document generation in README / `.env.example`.

---

## Security conventions

- Compare passwords with constant-time verify provided by the Argon2 library
- Rate-limit login attempts per IP + username (simple in-memory or SQLite counter for v1)
- Regenerate session ID on login (session fixation mitigation — follow Lucia defaults)
- Invalidate all sessions when a user is disabled or admin-resets their password
- Never expose password hashes, session IDs, or bootstrap secrets in API responses or logs
- Admin actions (create user, reset password, disable) should append to the notification stream as household-visible audit events where appropriate

---

## Testing

- Use in-memory SQLite (`DATABASE_URL=file::memory:?cache=shared`) per `01_tech.md`
- Test helpers: `createTestUser`, `loginAs`, `createAdminSession` for Vitest integration tests
- Cover: login success/failure, disabled user rejection, admin-only routes, last-admin guard, bootstrap idempotency

---

## Auth summary (machine-readable)

```yaml
auth:
  model: self-managed
  household_per_instance: 1
  provider: none  # no OAuth
  password_hash: argon2id
  password_hash_lib: "@node-rs/argon2"
  session: server-side
  session_store: sqlite
  session_lib: lucia
  session_adapter: "@lucia-auth/adapter-drizzle"
  roles: [member, admin]
  bootstrap: cli
  self_service_signup: false
  password_reset_email: false
  routes:
    public: [/login]
    protected: [/** except /login]
    admin: [/admin/**]
```

---

## Out of scope (for now)

- OAuth / social login (Google, Apple, etc.)
- Magic links or email-based login
- Two-factor authentication (TOTP, WebAuthn)
- Self-service registration or "forgot password"
- API keys or machine-to-machine auth
- Multiple households or cross-instance federation
- Fine-grained permissions beyond admin vs member
