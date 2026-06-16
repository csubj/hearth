import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/** Test-only: create inventory tables when migrations are not yet generated. */
export function ensureInventoryTablesForTests(): void {
  const db = getDb();
  db.run(sql`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      brand text,
      model text,
      serial text,
      item_type text,
      location text,
      purchase_date integer,
      store text,
      price text,
      warranty_note text,
      notes text,
      created_by_user_id text NOT NULL,
      updated_by_user_id text NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id),
      FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
    )
  `);
  db.run(sql`
    CREATE INDEX IF NOT EXISTS inventory_items_name_idx ON inventory_items (name)
  `);
  db.run(sql`
    CREATE INDEX IF NOT EXISTS inventory_items_item_type_idx ON inventory_items (item_type)
  `);
  db.run(sql`
    CREATE INDEX IF NOT EXISTS inventory_items_location_idx ON inventory_items (location)
  `);
  db.run(sql`
    CREATE INDEX IF NOT EXISTS inventory_items_updated_at_idx ON inventory_items (updated_at)
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS inventory_links (
      id text PRIMARY KEY NOT NULL,
      inventory_item_id text NOT NULL,
      label text NOT NULL,
      url text NOT NULL,
      created_at integer NOT NULL,
      FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
    )
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS inventory_tags (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      created_at integer NOT NULL
    )
  `);
  db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS inventory_tags_name_idx ON inventory_tags (name)
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS inventory_item_tags (
      inventory_item_id text NOT NULL,
      tag_id text NOT NULL,
      PRIMARY KEY (inventory_item_id, tag_id),
      FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES inventory_tags(id) ON DELETE CASCADE
    )
  `);
  db.run(sql`
    CREATE INDEX IF NOT EXISTS inventory_item_tags_item_id_idx
    ON inventory_item_tags (inventory_item_id)
  `);
  db.run(sql`
    CREATE INDEX IF NOT EXISTS inventory_item_tags_tag_id_idx
    ON inventory_item_tags (tag_id)
  `);
}
