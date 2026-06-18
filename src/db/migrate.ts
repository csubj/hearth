import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/db";

/** Apply pending migrations explicitly (manual CLI or tests). */
export function runMigrations(): void {
  migrate(getDb(), { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
