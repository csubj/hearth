import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import { mentions, notifications } from "@/db/schema";
import { migrateTestDb } from "@/db/test-setup";
import { createTestUser } from "@/lib/auth/test-helpers";
import { emitHouseholdActivity, emitMentions, emitMetricReminder } from "@/lib/notifications/emit";

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
      type: "project.created",
      actorId: actor.id,
      entityType: "project",
      entityId: crypto.randomUUID(),
      summary: "Actor added a project",
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
      entityType: "project",
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
      entityType: "project",
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
      entityType: "project",
      entityId,
      actorId: actor.id,
    });

    await emitMentions({
      body: "hello @alex again",
      entityType: "project",
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
      .where(and(eq(mentions.entityType, "project"), eq(mentions.entityId, entityId)));
    expect(mentionRows).toHaveLength(1);
    expect(mentionRows[0]!.mentionedUserId).toBe(mentioned.id);
  });

  it("removes stale mention rows when mention is edited out", async () => {
    const actor = await createTestUser({ username: "actor", displayName: "Actor" });
    await createTestUser({ username: "alex" });
    const entityId = crypto.randomUUID();

    await emitMentions({
      body: "hello @alex",
      entityType: "project",
      entityId,
      actorId: actor.id,
    });

    await emitMentions({
      body: "hello without mentions",
      entityType: "project",
      entityId,
      actorId: actor.id,
    });

    const mentionRows = await getDb()
      .select()
      .from(mentions)
      .where(and(eq(mentions.entityType, "project"), eq(mentions.entityId, entityId)));
    expect(mentionRows).toHaveLength(0);
  });

  it("broadcasts metric reminders to all active users", async () => {
    const first = await createTestUser({ username: "first" });
    const second = await createTestUser({ username: "second" });
    const metricId = crypto.randomUUID();

    await emitMetricReminder({
      metricId,
      metricName: "Flora's weight",
      intervalLabel: "2 weeks",
    });

    const rows = await getDb().select().from(notifications);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.recipientUserId).sort()).toEqual([first.id, second.id].sort());
    expect(rows.every((row) => row.type === "metric.reminder")).toBe(true);
    expect(rows.every((row) => row.actorUserId == null)).toBe(true);
    expect(rows[0]!.summary).toBe("Flora's weight hasn't been logged in 2 weeks");
  });
});
