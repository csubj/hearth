/**
 * CLI entry point for `pnpm db:seed` (design D19, task 14.3).
 *
 * Usage:
 *   pnpm db:seed             → insert a small smoke dataset
 *   pnpm db:seed --large     → insert the reference dataset from the
 *                              operations spec (10k entities, 500 places,
 *                              50k activity, 2k reminders, 5k comments)
 */

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "../db";
import { MIGRATIONS_FOLDER } from "../db/testing";
import { seedDatabase } from "./seed";

// Ensure the schema is present on a fresh database before seeding.
migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

const large = process.argv.includes("--large");

const opts = large
  ? {}
  : {
      entities: 200,
      places: 50,
      activity: 1_000,
      reminders: 200,
      comments: 200,
    };

const stats = seedDatabase(sqlite, opts);

console.log(
  `✓ seeded: ${stats.entities} entities, ${stats.places} places, ` +
    `${stats.activity} activity, ${stats.reminders} reminders, ${stats.comments} comments`,
);
process.exit(0);
