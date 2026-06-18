#!/usr/bin/env tsx
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "../src/db/schema";
import { attachments, mentions, notifications } from "../src/db/schema";
import { deleteUploadFile } from "../src/lib/attachments/storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function resolveDatabasePath(): string {
  const url = process.env.DATABASE_URL ?? "file:./data/hearth.db";
  if (url.startsWith("file:")) {
    return path.resolve(projectRoot, url.slice("file:".length));
  }
  return url;
}

function tableExists(sqlite: Database.Database, name: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return Boolean(row);
}

async function main(): Promise<void> {
  const dbPath = resolveDatabasePath();
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  if (!tableExists(sqlite, "events")) {
    console.log("events table not found — nothing to purge");
    return;
  }

  const eventAttachments = await db
    .select({ id: attachments.id, storagePath: attachments.storagePath })
    .from(attachments)
    .where(eq(attachments.entityType, "event"));

  for (const attachment of eventAttachments) {
    await deleteUploadFile(attachment.storagePath);
    await db.delete(attachments).where(eq(attachments.id, attachment.id));
  }

  await db.delete(mentions).where(eq(mentions.entityType, "event"));
  await db.delete(notifications).where(eq(notifications.entityType, "event"));
  sqlite.exec("DELETE FROM events");

  console.log(
    `Purged events: ${eventAttachments.length} attachment(s), related mentions/notifications, and all event rows`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
