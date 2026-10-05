/**
 * Reference-dataset seeder (design D19, task 14.3).
 *
 * `seedDatabase(conn, opts)` inserts the reference dataset from the
 * operations spec — entities, places, activity, reminders, and comments —
 * directly via SQL for volume, then rebuilds the FTS5 search index so list,
 * search, Today, the due feed, and the reminder job all have data to work
 * against. It is used by both `pnpm db:seed` (CLI) and the perf/EXPLAIN/
 * restore-drill tests.
 *
 * Direct inserts are used deliberately: seeding is a bulk, run-once operation
 * (the write pipeline would add per-row activity/attention/reindex overhead
 * for no benefit). The FTS index is rebuilt at the end so search works.
 *
 * The seeder is idempotent-ish: users are inserted with `ON CONFLICT DO
 * NOTHING`, and everything else is appended. Re-running grows the dataset.
 */

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { rebuildAllIndex } from "../db/search";

// ---------------------------------------------------------------------------
// Reference dataset sizes (design D19)
// ---------------------------------------------------------------------------

export const REFERENCE_DATASET = {
  entities: 10_000,
  places: 500,
  activity: 50_000,
  reminders: 2_000,
  comments: 5_000,
} as const;

export interface SeedOptions {
  /** Number of notes-page entities to insert. */
  entities?: number;
  /** Number of place entities (properties + rooms/areas) to insert. */
  places?: number;
  /** Number of activity rows to insert. */
  activity?: number;
  /** Number of reminders to insert. */
  reminders?: number;
  /** Number of comments to insert. */
  comments?: number;
  /** Rebuild the FTS5 search index after seeding. Default true. */
  rebuildSearch?: boolean;
}

export interface SeedStats {
  entities: number;
  places: number;
  activity: number;
  reminders: number;
  comments: number;
}

// ---------------------------------------------------------------------------
// Default users created by the seeder (fixed ids referenced everywhere).
// ---------------------------------------------------------------------------

export const SEED_ADMIN_ID = "seed-admin-user";
export const SEED_MEMBER_ID = "seed-member-user";

const CATEGORIES = ["reference", "how-to", "contacts", "other"] as const;

// ---------------------------------------------------------------------------
// seedDatabase
// ---------------------------------------------------------------------------

/**
 * Insert the reference dataset into `conn` (already migrated).
 *
 * Users are created first (entities have NOT NULL FK to `user`), then places,
 * notes-page entities, activity, comments, and reminders. The FTS5 index is
 * rebuilt at the end unless `rebuildSearch: false`.
 *
 * Returns the number of rows inserted per table.
 */
export function seedDatabase(
  conn: Database.Database,
  opts: SeedOptions = {},
): SeedStats {
  const counts = {
    entities: opts.entities ?? REFERENCE_DATASET.entities,
    places: opts.places ?? REFERENCE_DATASET.places,
    activity: opts.activity ?? REFERENCE_DATASET.activity,
    reminders: opts.reminders ?? REFERENCE_DATASET.reminders,
    comments: opts.comments ?? REFERENCE_DATASET.comments,
  };

  seedUsers(conn);

  const now = Date.now();

  conn.exec("BEGIN IMMEDIATE");
  try {
    const placeIds = seedPlaces(conn, counts.places, now);
    const entityIds = seedEntities(conn, counts.entities, placeIds, now);
    seedActivity(conn, counts.activity, entityIds, now);
    seedComments(conn, counts.comments, entityIds, now);
    seedReminders(conn, counts.reminders, entityIds, now);
    conn.exec("COMMIT");
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }

  if (opts.rebuildSearch !== false) {
    rebuildAllIndex(conn);
  }

  return {
    entities: counts.entities,
    places: counts.places,
    activity: counts.activity,
    reminders: counts.reminders,
    comments: counts.comments,
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function seedUsers(conn: Database.Database): void {
  const insert = conn.prepare(
    `INSERT OR IGNORE INTO user
     (id, name, email, email_verified, created_at, updated_at, username, role, banned)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?, 0)`,
  );
  insert.run(
    SEED_ADMIN_ID,
    "Seed Admin",
    `${SEED_ADMIN_ID}@users.hearth.invalid`,
    Date.now(),
    Date.now(),
    "seed-admin",
    "admin",
  );
  insert.run(
    SEED_MEMBER_ID,
    "Seed Member",
    `${SEED_MEMBER_ID}@users.hearth.invalid`,
    Date.now(),
    Date.now(),
    "seed-member",
    "user",
  );
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

/**
 * Create `count` place entities. The first `properties` (up to 100) are
 * top-level properties; the rest are rooms/areas under a random property.
 * Returns the entity ids of every place made (used to place entities).
 */
function seedPlaces(
  conn: Database.Database,
  count: number,
  now: number,
): string[] {
  const ids: string[] = [];

  const propertyCount = Math.min(count, 100);
  const roomCount = count - propertyCount;

  const insertEntity = conn.prepare(
    `INSERT INTO entities
     (id, type, title, place_id, version, created_by, created_via,
      updated_by, updated_via, created_at, updated_at)
     VALUES (?, 'place', ?, ?, 1, ?, NULL, ?, NULL, ?, ?)`,
  );
  const insertPlace = conn.prepare(
    "INSERT INTO places (entity_id, kind, path) VALUES (?, ?, ?)",
  );

  const properties: Array<{ id: string; path: string }> = [];

  // Top-level properties.
  for (let i = 0; i < propertyCount; i++) {
    const id = randomUUID();
    const title = `Property ${i + 1}`;
    const path = `/${id}/`;
    insertEntity.run(id, title, null, SEED_ADMIN_ID, SEED_ADMIN_ID, now, now);
    insertPlace.run(id, "property", path);
    ids.push(id);
    properties.push({ id, path });
  }

  // Rooms / areas under a random property.
  for (let i = 0; i < roomCount; i++) {
    const id = randomUUID();
    const title = `Room ${i + 1}`;
    const parent = properties[i % properties.length];
    const path = `${parent.path}${id}/`;
    insertEntity.run(id, title, parent.id, SEED_ADMIN_ID, SEED_ADMIN_ID, now, now);
    insertPlace.run(id, "room", path);
    ids.push(id);
  }

  return ids;
}

// ---------------------------------------------------------------------------
// Entities (notes-page)
// ---------------------------------------------------------------------------

function seedEntities(
  conn: Database.Database,
  count: number,
  placeIds: string[],
  now: number,
): string[] {
  const ids: string[] = [];

  const insertEntity = conn.prepare(
    `INSERT INTO entities
     (id, type, title, place_id, version, created_by, created_via,
      updated_by, updated_via, created_at, updated_at)
     VALUES (?, 'notes-page', ?, ?, 1, ?, NULL, ?, NULL, ?, ?)`,
  );
  const insertDetails = conn.prepare(
    "INSERT INTO notes_page_details (entity_id, category, review_on) VALUES (?, ?, ?)",
  );

  // Unplaced entities stay visible under any scope (design D7).
  const unplacedEvery = 7;

  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    const title = `Household note ${i + 1}`;
    const placeId = i % unplacedEvery === 0 ? null : placeIds[i % placeIds.length];
    const category = CATEGORIES[i % CATEGORIES.length];
    const reviewOn =
      i % 11 === 0 ? `20${String(25 + (i % 10)).padStart(2, "0")}-${String(1 + (i % 12)).padStart(2, "0")}-15` : null;

    insertEntity.run(
      id,
      title,
      placeId,
      SEED_ADMIN_ID,
      SEED_ADMIN_ID,
      now,
      now,
    );
    insertDetails.run(id, category, reviewOn);
    ids.push(id);
  }

  return ids;
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

function seedActivity(
  conn: Database.Database,
  count: number,
  entityIds: string[],
  now: number,
): void {
  const insert = conn.prepare(
    `INSERT INTO activity
     (id, entity_id, actor_id, api_key_id, via_label, action, diff, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 'web', ?, ?, ?, ?)`,
  );
  const actions = ["create", "update", "comment", "tags", "archive"];
  const base = now - count * 60_000; // spread over the past `count` minutes

  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    const entityId = entityIds[i % entityIds.length];
    const action = actions[i % actions.length];
    const ts = base + i * 60_000;
    const diff =
      action === "update"
        ? JSON.stringify({ fields: { title: [`note`, `note ${i}`] } })
        : JSON.stringify({ title: [null, `note ${i}`] });
    insert.run(id, entityId, SEED_ADMIN_ID, action, diff, ts, ts);
  }
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function seedComments(
  conn: Database.Database,
  count: number,
  entityIds: string[],
  now: number,
): void {
  const insert = conn.prepare(
    `INSERT INTO comments
     (id, entity_id, author_id, doc, markdown, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const base = now - count * 60_000;

  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    const entityId = entityIds[i % entityIds.length];
    const ts = base + i * 60_000;
    const markdown = `Seed comment ${i + 1}.`;
    const doc = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: markdown }] }],
    });
    insert.run(id, entityId, SEED_MEMBER_ID, doc, markdown, ts);
  }
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

function seedReminders(
  conn: Database.Database,
  count: number,
  entityIds: string[],
  now: number,
): void {
  const insertReminder = conn.prepare(
    `INSERT INTO reminders
     (id, entity_id, title, kind, every_count, every_unit, due_on, created_at)
     VALUES (?, ?, ?, 'interval', ?, 'day', ?, ?)`,
  );
  const insertRecipient = conn.prepare(
    "INSERT INTO reminder_recipients (reminder_id, user_id) VALUES (?, ?)",
  );

  const today = new Date(now).toISOString().slice(0, 10);

  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    const entityId = entityIds[i % entityIds.length];
    // Mix overdue, today, and upcoming so the due feed and reminder job both
    // have work to do on a real reference dataset.
    const offset = (i % 5) - 2; // -2..+2 days
    const due = new Date(now + offset * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const everyCount = 1 + (i % 30);
    insertReminder.run(
      id,
      entityId,
      `Reminder ${i + 1}`,
      everyCount,
      due,
      now,
    );
    // Explicit recipient so the due feed resolves to a known member.
    if (i % 2 === 0) {
      insertRecipient.run(id, SEED_ADMIN_ID);
    }
    void today;
  }
}
