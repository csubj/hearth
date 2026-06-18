import { resetDbForTests } from "@/db";
import { runMigrations } from "@/db/migrate";

export function migrateTestDb(): void {
  runMigrations();
}

export function setupTestDb(): void {
  resetDbForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
}
