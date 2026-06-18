import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { mentions, notifications, users } from "@/db/schema";
import { parseMentions, type MentionCandidate } from "@/lib/mentions/parse";

export type EntityType = "restaurant" | "project" | "metric" | "metric_entry" | "inventory_item";

export interface EmitHouseholdActivityInput {
  type: string;
  actorId: string;
  entityType: EntityType;
  entityId: string;
  summary: string;
  extraRecipients?: string[];
}

export interface EmitMentionsInput {
  body: string;
  entityType: EntityType;
  entityId: string;
  actorId: string;
}

const ENTITY_MENTION_LABEL: Record<EntityType, string> = {
  restaurant: "a restaurant",
  project: "a project",
  metric: "a metric",
  metric_entry: "a metric entry",
  inventory_item: "an inventory item",
};

async function loadActiveUsers(): Promise<MentionCandidate[]> {
  return getDb()
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(isNull(users.disabledAt));
}

async function loadHouseholdRecipientIds(actorId: string): Promise<string[]> {
  const rows = await getDb().select({ id: users.id }).from(users).where(isNull(users.disabledAt));

  return rows.map((row) => row.id).filter((id) => id !== actorId);
}

async function loadAdminRecipientIds(actorId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(and(isNull(users.disabledAt), eq(users.role, "admin")));

  return rows.map((row) => row.id).filter((id) => id !== actorId);
}

async function getActorDisplayName(actorId: string): Promise<string> {
  const [actor] = await getDb()
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1);

  return actor ? (actor.displayName ?? actor.username) : "Someone";
}

async function insertNotificationRow(input: {
  recipientUserId: string;
  actorUserId: string | null;
  type: string;
  entityType: EntityType;
  entityId: string;
  summary: string;
}): Promise<void> {
  const now = new Date();
  await getDb().insert(notifications).values({
    id: crypto.randomUUID(),
    recipientUserId: input.recipientUserId,
    actorUserId: input.actorUserId,
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    readAt: null,
    createdAt: now,
  });
}

export async function emitHouseholdActivity(input: EmitHouseholdActivityInput): Promise<void> {
  try {
    const recipients =
      input.type === "user.admin_action"
        ? await loadAdminRecipientIds(input.actorId)
        : await loadHouseholdRecipientIds(input.actorId);

    const recipientSet = new Set(recipients);
    for (const extra of input.extraRecipients ?? []) {
      if (extra !== input.actorId) {
        recipientSet.add(extra);
      }
    }

    await Promise.all(
      [...recipientSet].map((recipientUserId) =>
        insertNotificationRow({
          recipientUserId,
          actorUserId: input.actorId,
          type: input.type,
          entityType: input.entityType,
          entityId: input.entityId,
          summary: input.summary,
        }),
      ),
    );
  } catch (error) {
    console.error("[notifications] emitHouseholdActivity failed", error);
  }
}

export async function emitMentions(input: EmitMentionsInput): Promise<void> {
  try {
    const db = getDb();
    const activeUsers = await loadActiveUsers();
    const mentionedUserIds = parseMentions(input.body, activeUsers).filter(
      (userId) => userId !== input.actorId,
    );

    const previousRows = await db
      .select({ mentionedUserId: mentions.mentionedUserId })
      .from(mentions)
      .where(and(eq(mentions.entityType, input.entityType), eq(mentions.entityId, input.entityId)));

    const previousUserIds = new Set(previousRows.map((row) => row.mentionedUserId));

    await db
      .delete(mentions)
      .where(and(eq(mentions.entityType, input.entityType), eq(mentions.entityId, input.entityId)));

    const now = new Date();
    for (const userId of mentionedUserIds) {
      await db.insert(mentions).values({
        id: crypto.randomUUID(),
        mentionedUserId: userId,
        entityType: input.entityType,
        entityId: input.entityId,
        createdByUserId: input.actorId,
        createdAt: now,
      });
    }

    const newlyMentioned = mentionedUserIds.filter((userId) => !previousUserIds.has(userId));
    if (newlyMentioned.length === 0) {
      return;
    }

    const actorName = await getActorDisplayName(input.actorId);
    const context = ENTITY_MENTION_LABEL[input.entityType];
    const summary = `${actorName} mentioned you in ${context}`;

    await Promise.all(
      newlyMentioned.map((recipientUserId) =>
        insertNotificationRow({
          recipientUserId,
          actorUserId: input.actorId,
          type: "mention",
          entityType: input.entityType,
          entityId: input.entityId,
          summary,
        }),
      ),
    );
  } catch (error) {
    console.error("[notifications] emitMentions failed", error);
  }
}

import { resolveReminderRecipientIds } from "@/lib/reminders/scope";

export interface EmitIntervalReminderInput {
  type: string;
  entityType: EntityType;
  entityId: string;
  summary: string;
  recipientUserId: string | null;
}

export async function emitIntervalReminder(input: EmitIntervalReminderInput): Promise<void> {
  try {
    const recipientIds = await resolveReminderRecipientIds(input.recipientUserId);

    await Promise.all(
      recipientIds.map((recipientUserId) =>
        insertNotificationRow({
          recipientUserId,
          actorUserId: null,
          type: input.type,
          entityType: input.entityType,
          entityId: input.entityId,
          summary: input.summary,
        }),
      ),
    );
  } catch (error) {
    console.error("[notifications] emitIntervalReminder failed", error);
  }
}

export interface EmitMetricReminderInput {
  metricId: string;
  metricName: string;
  intervalLabel: string;
  recipientUserId: string | null;
}

export async function emitMetricReminder(input: EmitMetricReminderInput): Promise<void> {
  await emitIntervalReminder({
    type: "metric.reminder",
    entityType: "metric",
    entityId: input.metricId,
    summary: `${input.metricName} hasn't been logged in ${input.intervalLabel}`,
    recipientUserId: input.recipientUserId,
  });
}

export interface EmitInventoryMaintenanceReminderInput {
  inventoryItemId: string;
  reminderTitle: string;
  itemName: string;
  intervalLabel: string;
  recipientUserId: string | null;
}

export async function emitInventoryMaintenanceReminder(
  input: EmitInventoryMaintenanceReminderInput,
): Promise<void> {
  await emitIntervalReminder({
    type: "inventory.maintenance_reminder",
    entityType: "inventory_item",
    entityId: input.inventoryItemId,
    summary: `${input.reminderTitle} (${input.itemName}) is due for maintenance`,
    recipientUserId: input.recipientUserId,
  });
}
