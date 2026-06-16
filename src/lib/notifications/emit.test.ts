import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import { mentions, notifications } from "@/db/schema";
import { migrateTestDb } from "@/db/test-setup";
import { createTestUser } from "@/lib/auth/test-helpers";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";

function resetTestDb(): void {
  resetDbForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
}

describe("notification emit", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("fan-out excludes actor", async () => {
    const actor = await createTestUser({ username: "actor" });
    const other = await createTestUser({ username: "other" });

    await emitHouseholdActivity({
      type: "stream.created",
      actorId: actor.id,
      entityType: "stream_entry",
      entityId: crypto.randomUUID(),
      summary: "Actor added a stream note",
    });

    const rows = await getDb().select().from(notifications);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.recipientUserId).toBe(other.id);
    expect(rows[0]!.actorUserId).toBe(actor.id);
  });

  it("creates mention notification for mentioned user only", async () => {
    const actor = await createTestUser({ username: "actor", displayName: "Actor" });
    const mentioned = await createTestUser({ username: "alex", displayName: "Alex" });
    await createTestUser({ username: "bystander" });

    const entityId = crypto.randomUUID();
    await emitMentions({
      body: "hello @alex",
      entityType: "stream_entry",
      entityId,
      actorId: actor.id,
    });

    const mentionRows = await getDb().select().from(mentions);
    expect(mentionRows).toHaveLength(1);
    expect(mentionRows[0]!.mentionedUserId).toBe(mentioned.id);

    const notifRows = await getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.type, "mention"));
    expect(notifRows).toHaveLength(1);
    expect(notifRows[0]!.recipientUserId).toBe(mentioned.id);
  });

  it("ignores self-mention", async () => {
    const actor = await createTestUser({ username: "actor" });

    await emitMentions({
      body: "note to @actor",
      entityType: "stream_entry",
      entityId: crypto.randomUUID(),
      actorId: actor.id,
    });

    const mentionRows = await getDb().select().from(mentions);
    expect(mentionRows).toHaveLength(0);

    const notifRows = await getDb().select().from(notifications);
    expect(notifRows).toHaveLength(0);
  });

  it("dedupes mention notifications on edit", async () => {
    const actor = await createTestUser({ username: "actor", displayName: "Actor" });
    const mentioned = await createTestUser({ username: "alex" });
    const entityId = crypto.randomUUID();

    await emitMentions({
      body: "hello @alex",
      entityType: "stream_entry",
      entityId,
      actorId: actor.id,
    });

    await emitMentions({
      body: "hello @alex again",
      entityType: "stream_entry",
      entityId,
      actorId: actor.id,
    });

    const notifRows = await getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.type, "mention"));
    expect(notifRows).toHaveLength(1);

    const mentionRows = await getDb()
      .select()
      .from(mentions)
      .where(and(eq(mentions.entityType, "stream_entry"), eq(mentions.entityId, entityId)));
    expect(mentionRows).toHaveLength(1);
    expect(mentionRows[0]!.mentionedUserId).toBe(mentioned.id);
  });

  it("removes stale mention rows when mention is edited out", async () => {
    const actor = await createTestUser({ username: "actor", displayName: "Actor" });
    await createTestUser({ username: "alex" });
    const entityId = crypto.randomUUID();

    await emitMentions({
      body: "hello @alex",
      entityType: "stream_entry",
      entityId,
      actorId: actor.id,
    });

    await emitMentions({
      body: "hello without mentions",
      entityType: "stream_entry",
      entityId,
      actorId: actor.id,
    });

    const mentionRows = await getDb()
      .select()
      .from(mentions)
      .where(and(eq(mentions.entityType, "stream_entry"), eq(mentions.entityId, entityId)));
    expect(mentionRows).toHaveLength(0);
  });
});
