import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function createAttachmentsTestTable(): Promise<void> {
  const db = getDb();
  db.run(sql`
    CREATE TABLE IF NOT EXISTS attachments (
      id text PRIMARY KEY NOT NULL,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      filename text NOT NULL,
      mime_type text NOT NULL,
      size_bytes integer NOT NULL,
      storage_path text NOT NULL,
      created_by_user_id text NOT NULL REFERENCES users(id),
      created_at integer NOT NULL
    )
  `);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS attachments_entity_type_entity_id_idx ON attachments (entity_type, entity_id)`,
  );
}

export async function createTempUploadsDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hearth-uploads-"));
  process.env.UPLOADS_DIR = dir;
  return dir;
}

export async function removeTempUploadsDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
  delete process.env.UPLOADS_DIR;
}

/** Minimal valid JPEG (1x1 pixel). */
export function createTestJpegBuffer(): Buffer {
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//2wBDAQ//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=",
    "base64",
  );
}

export function createInvalidBuffer(): Buffer {
  return Buffer.from("not-an-image", "utf8");
}

export function createOversizeBuffer(): Buffer {
  return Buffer.alloc(10 * 1024 * 1024 + 1, 0xff);
}
