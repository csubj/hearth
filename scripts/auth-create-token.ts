#!/usr/bin/env tsx
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "../src/db/schema";
import { users } from "../src/db/schema/users";
import { createApiTokenForUser } from "../src/lib/auth/api-tokens";
import { ensureApiTokensTableForTests } from "../src/lib/api/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function resolveDatabasePath(): string {
  const url = process.env.DATABASE_URL ?? "file:./data/hearth.db";
  if (url.startsWith("file:")) {
    return path.resolve(projectRoot, url.slice("file:".length));
  }
  return url;
}

async function main(): Promise<void> {
  const username = process.env.HEARTH_TOKEN_USERNAME?.trim();
  const name = process.env.HEARTH_TOKEN_NAME?.trim() ?? "cli-token";

  if (!username) {
    console.error("HEARTH_TOKEN_USERNAME is required (username to attribute API writes to).");
    process.exit(1);
  }

  const dbPath = resolveDatabasePath();
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: path.join(projectRoot, "drizzle") });
  try {
    ensureApiTokensTableForTests();
  } catch {
    // table may already exist from migration
  }

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user || user.disabledAt) {
    console.error(`User "${username}" not found or disabled.`);
    process.exit(1);
  }

  const created = await createApiTokenForUser(user.id, name);
  console.log(`API token created for @${username}`);
  console.log(`Prefix: ${created.prefix}`);
  console.log(`Token (store securely): ${created.token}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
