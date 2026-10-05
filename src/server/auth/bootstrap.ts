/**
 * First-run bootstrap: creates the first admin user (design D6).
 *
 * The function uses Better Auth's internal adapter so the password is hashed
 * by Better Auth's own scrypt implementation and all plugin hooks run (username
 * normalisation, admin role assignment). `disableSignUp: true` prevents
 * using `auth.api.signUpEmail`, and `auth.api.createUser` requires an existing
 * admin session (circular on a fresh instance), so the internal adapter is the
 * correct path per design D6.
 *
 * CLI: pnpm auth:bootstrap
 *   Reads ADMIN_USERNAME (default "admin") and ADMIN_PASSWORD (required) from
 *   the environment. Exits non-zero with a clear message if anything goes wrong
 *   or if any users already exist.
 */

import { count } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { fileURLToPath } from "node:url";
import { db as defaultDb, schema } from "../../db";
import { auth as defaultAuth } from "./index";

// ---------------------------------------------------------------------------
// Minimal structural interfaces for the Better Auth internals we call.
// We only declare what bootstrapAdmin actually uses so the interface stays
// narrow and test auth instances remain assignable.
// ---------------------------------------------------------------------------

/** Minimum auth context shape used by bootstrapAdmin. */
interface BootstrapContext {
  password: {
    hash(password: string): Promise<string>;
  };
  internalAdapter: {
    createUser(
      user: {
        email: string;
        name: string;
        emailVerified?: boolean;
        [key: string]: unknown;
      },
      source: { method: string },
    ): Promise<{ id: string } & Record<string, unknown>>;
    linkAccount(account: {
      userId: string;
      providerId: string;
      accountId: string;
      password?: string;
    }): Promise<unknown>;
  };
}

/** Minimum auth instance shape used by bootstrapAdmin. */
export interface BootstrapAuthInstance {
  $context: Promise<BootstrapContext>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Thrown by bootstrapAdmin when it refuses or encounters a problem. */
export class BootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapError";
  }
}

/** The result returned by a successful bootstrapAdmin call. */
export interface BootstrapResult {
  id: string;
  username: string;
  email: string;
}

/**
 * Creates the first admin user using credentials from the environment.
 *
 * Reads `ADMIN_USERNAME` (default `"admin"`) and `ADMIN_PASSWORD` (required)
 * from `process.env`. Email is synthesised as `<username>@users.hearth.invalid`.
 *
 * Throws `BootstrapError`:
 * - if any user already exists in the DB (exits non-zero in CLI mode)
 * - if `ADMIN_PASSWORD` is missing or shorter than 8 characters
 *
 * @param deps - Optional overrides for the auth instance and DB client (used
 *   in tests to inject in-memory instances without touching the real DB).
 */
export async function bootstrapAdmin(deps?: {
  auth?: BootstrapAuthInstance;
  // Accept the base BetterSQLite3Database without the `$client` intersection
  // so that createTestDatabase().client (typed without $client) is assignable.
  db?: BetterSQLite3Database<typeof schema>;
}): Promise<BootstrapResult> {
  // Use the provided deps or fall back to the module-level singletons.
  // The cast is required because `defaultAuth` is `Auth<typeof authOptions>`;
  // we access only the narrow `BootstrapAuthInstance` subset at runtime.
  const authInstance: BootstrapAuthInstance =
    deps?.auth ?? (defaultAuth as unknown as BootstrapAuthInstance);
  const dbInstance = deps?.db ?? defaultDb;

  // 1. Refuse if any user already exists — bootstrap is a one-shot command.
  const [{ value: userCount }] = await dbInstance
    .select({ value: count() })
    .from(schema.user);

  if (userCount > 0) {
    throw new BootstrapError(
      `Bootstrap refused: ${userCount} user(s) already exist. ` +
        "Use admin procedures to manage users.",
    );
  }

  // 2. Read and validate credentials from the environment.
  const username = (process.env.ADMIN_USERNAME ?? "admin").trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    throw new BootstrapError(
      "ADMIN_PASSWORD environment variable is required.",
    );
  }
  if (password.length < 8) {
    throw new BootstrapError(
      "ADMIN_PASSWORD must be at least 8 characters.",
    );
  }

  const email = `${username}@users.hearth.invalid`;

  // 3. Create the user through Better Auth's internal adapter.
  //    The admin plugin hook sets `role: defaultRole` first, then spreads
  //    the user data — so passing `role: "admin"` here takes precedence.
  const ctx = await authInstance.$context;
  const hash = await ctx.password.hash(password);

  const created = await ctx.internalAdapter.createUser(
    {
      email,
      name: username,
      username,
      role: "admin",
      emailVerified: true,
    },
    { method: "admin" },
  );

  if (!created) {
    throw new BootstrapError("Failed to create admin user.");
  }

  // 4. Attach a credential account so the user can sign in with a password.
  //    This mirrors what Better Auth's sign-up route does after hashing.
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: hash,
  });

  return { id: created.id, username, email };
}

// ---------------------------------------------------------------------------
// CLI entry point — executed when run directly via `pnpm auth:bootstrap`
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  bootstrapAdmin()
    .then(({ username, email }) => {
      console.log(`✓ Admin user created: ${username} (${email})`);
      process.exit(0);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${message}`);
      process.exit(1);
    });
}
