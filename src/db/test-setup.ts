import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, resetDbForTests } from "@/db";

export function migrateTestDb(): void {
  const db = getDb();
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}

export function setupTestDb(): void {
  resetDbForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
}
