/**
 * Reset a user's password to a known value.
 *
 * Reads ADMIN_USERNAME (default "admin") and ADMIN_PASSWORD (default
 * "admin1234") from the environment. Uses Better Auth's internal adapter
 * so the password is hashed with the same scrypt implementation as
 * bootstrap and the live app.
 *
 * Usage:
 *   tsx scripts/reset-admin-password.ts
 *   ADMIN_PASSWORD="hunter2" tsx scripts/reset-admin-password.ts
 */

import { fileURLToPath } from "node:url";
import { eq, and } from "drizzle-orm";
import { db } from "../src/db";
import { user as userTable, account as accountTable } from "../src/db/schema";
import { auth } from "../src/server/auth";

async function resetAdminPassword(): Promise<void> {
  const username = (process.env.ADMIN_USERNAME ?? "admin").trim();
  const password = process.env.ADMIN_PASSWORD ?? "admin1234";

  if (password.length < 8) {
    console.error("✗ ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  // Find the user by username.
  const found = db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.username, username))
    .get();

  if (!found) {
    console.error(`✗ No user found with username "${username}".`);
    process.exit(1);
  }

  // Find their credential account.
  const credAccount = db
    .select({ id: accountTable.id })
    .from(accountTable)
    .where(
      and(
        eq(accountTable.userId, found.id),
        eq(accountTable.providerId, "credential"),
      ),
    )
    .get();

  if (!credAccount) {
    console.error(
      `✗ No credential account found for user "${username}".`,
    );
    process.exit(1);
  }

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);

  db.update(accountTable)
    .set({ password: hash, updatedAt: new Date() })
    .where(eq(accountTable.id, credAccount.id))
    .run();

  console.log(`✓ Password reset for "${username}" (user id: ${found.id})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  resetAdminPassword().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`✗ ${message}`);
    process.exit(1);
  });
}