import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  inventoryMaintenanceReminderLinks,
  inventoryMaintenanceReminders,
  type InventoryMaintenanceReminder,
  type InventoryMaintenanceReminderLink,
} from "@/db/schema";
import type { AuthUser } from "@/lib/auth/lucia";
import { paginateRows, type PaginationQuery } from "@/lib/api/pagination";
import { toIso } from "@/lib/api/serialize";
import { resolveReminderFields } from "@/lib/reminders/form";
import type {
  createInventoryMaintenanceReminderSchema,
  updateInventoryMaintenanceReminderSchema,
} from "@/lib/api/schemas";
import type { z } from "zod";
import { getInventoryItemApi } from "@/lib/api/inventory-resources";

export type MaintenanceReminderWithLinksRow = InventoryMaintenanceReminder & {
  links: InventoryMaintenanceReminderLink[];
};

export function serializeInventoryMaintenanceReminder(
  row: MaintenanceReminderWithLinksRow,
) {
  return {
    id: row.id,
    inventoryItemId: row.inventoryItemId,
    title: row.title,
    notes: row.notes,
    reminderIntervalCount: row.reminderIntervalCount,
    reminderIntervalUnit: row.reminderIntervalUnit,
    reminderRecipientUserId: row.reminderRecipientUserId,
    lastCompletedAt: toIso(row.lastCompletedAt),
    lastReminderAt: toIso(row.lastReminderAt),
    createdByUserId: row.createdByUserId,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
    links: row.links.map((link) => ({
      id: link.id,
      label: link.label,
      url: link.url,
      createdAt: toIso(link.createdAt)!,
    })),
  };
}

async function loadLinksForReminders(
  reminderIds: string[],
): Promise<Map<string, InventoryMaintenanceReminderLink[]>> {
  const result = new Map<string, InventoryMaintenanceReminderLink[]>();
  if (reminderIds.length === 0) {
    return result;
  }

  const links = await getDb()
    .select()
    .from(inventoryMaintenanceReminderLinks)
    .where(inArray(inventoryMaintenanceReminderLinks.reminderId, reminderIds));

  for (const link of links) {
    const current = result.get(link.reminderId) ?? [];
    current.push(link);
    result.set(link.reminderId, current);
  }

  return result;
}

async function attachLinks(
  reminder: InventoryMaintenanceReminder,
): Promise<MaintenanceReminderWithLinksRow> {
  const linksByReminder = await loadLinksForReminders([reminder.id]);
  return {
    ...reminder,
    links: linksByReminder.get(reminder.id) ?? [],
  };
}

export async function listInventoryMaintenanceRemindersApi(
  inventoryItemId: string,
  query: PaginationQuery,
) {
  const item = await getInventoryItemApi(inventoryItemId);
  if (!item) {
    return null;
  }

  const rows = await getDb()
    .select()
    .from(inventoryMaintenanceReminders)
    .where(eq(inventoryMaintenanceReminders.inventoryItemId, inventoryItemId))
    .orderBy(inventoryMaintenanceReminders.createdAt);

  const linksByReminder = await loadLinksForReminders(rows.map((row) => row.id));
  const withLinks = rows.map((row) => ({
    ...row,
    links: linksByReminder.get(row.id) ?? [],
  }));

  const limited = withLinks.slice(0, query.limit + 1);
  return paginateRows(limited, query.limit);
}

export async function getInventoryMaintenanceReminderApi(
  inventoryItemId: string,
  reminderId: string,
): Promise<MaintenanceReminderWithLinksRow | null> {
  const [reminder] = await getDb()
    .select()
    .from(inventoryMaintenanceReminders)
    .where(
      and(
        eq(inventoryMaintenanceReminders.id, reminderId),
        eq(inventoryMaintenanceReminders.inventoryItemId, inventoryItemId),
      ),
    )
    .limit(1);

  if (!reminder) {
    return null;
  }

  return attachLinks(reminder);
}

export async function createInventoryMaintenanceReminderApi(
  user: AuthUser,
  inventoryItemId: string,
  input: z.infer<typeof createInventoryMaintenanceReminderSchema>,
): Promise<MaintenanceReminderWithLinksRow | null> {
  const item = await getInventoryItemApi(inventoryItemId);
  if (!item) {
    return null;
  }

  const now = new Date();
  const reminderId = crypto.randomUUID();
  const intervalFields = resolveReminderFields({
    remindersEnabled: input.reminderIntervalCount != null,
    reminderIntervalCount: input.reminderIntervalCount ?? null,
    reminderIntervalUnit: input.reminderIntervalUnit ?? null,
    reminderRecipientUserId: input.reminderRecipientUserId ?? null,
  });

  await getDb().insert(inventoryMaintenanceReminders).values({
    id: reminderId,
    inventoryItemId,
    title: input.title,
    notes: input.notes ?? null,
    ...intervalFields,
    lastCompletedAt: null,
    lastReminderAt: null,
    createdByUserId: user.id,
    createdAt: now,
    updatedAt: now,
  });

  if (input.links?.length) {
    await getDb().insert(inventoryMaintenanceReminderLinks).values(
      input.links.map((link) => ({
        id: crypto.randomUUID(),
        reminderId,
        label: link.label,
        url: link.url,
        createdAt: now,
      })),
    );
  }

  return getInventoryMaintenanceReminderApi(inventoryItemId, reminderId);
}

export async function updateInventoryMaintenanceReminderApi(
  _user: AuthUser,
  inventoryItemId: string,
  reminderId: string,
  input: z.infer<typeof updateInventoryMaintenanceReminderSchema>,
): Promise<MaintenanceReminderWithLinksRow | null> {
  const [existing] = await getDb()
    .select()
    .from(inventoryMaintenanceReminders)
    .where(
      and(
        eq(inventoryMaintenanceReminders.id, reminderId),
        eq(inventoryMaintenanceReminders.inventoryItemId, inventoryItemId),
      ),
    )
    .limit(1);

  if (!existing) {
    return null;
  }

  const now = new Date();
  const intervalFields =
    input.reminderIntervalCount === undefined && input.reminderIntervalUnit === undefined
      ? {
          reminderIntervalCount: existing.reminderIntervalCount,
          reminderIntervalUnit: existing.reminderIntervalUnit,
          reminderRecipientUserId:
            input.reminderRecipientUserId !== undefined
              ? input.reminderRecipientUserId
              : existing.reminderRecipientUserId,
        }
      : resolveReminderFields({
          remindersEnabled: input.reminderIntervalCount !== null,
          reminderIntervalCount:
            input.reminderIntervalCount !== undefined
              ? input.reminderIntervalCount
              : existing.reminderIntervalCount,
          reminderIntervalUnit:
            input.reminderIntervalUnit !== undefined
              ? input.reminderIntervalUnit
              : existing.reminderIntervalUnit,
          reminderRecipientUserId:
            input.reminderRecipientUserId !== undefined
              ? input.reminderRecipientUserId
              : existing.reminderRecipientUserId,
        });

  await getDb()
    .update(inventoryMaintenanceReminders)
    .set({
      title: input.title ?? existing.title,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      ...intervalFields,
      updatedAt: now,
    })
    .where(eq(inventoryMaintenanceReminders.id, reminderId));

  return getInventoryMaintenanceReminderApi(inventoryItemId, reminderId);
}

export async function deleteInventoryMaintenanceReminderApi(
  inventoryItemId: string,
  reminderId: string,
): Promise<boolean> {
  const result = await getDb()
    .delete(inventoryMaintenanceReminders)
    .where(
      and(
        eq(inventoryMaintenanceReminders.id, reminderId),
        eq(inventoryMaintenanceReminders.inventoryItemId, inventoryItemId),
      ),
    );

  return result.changes > 0;
}

export async function completeInventoryMaintenanceReminderApi(
  inventoryItemId: string,
  reminderId: string,
): Promise<MaintenanceReminderWithLinksRow | null> {
  const now = new Date();
  const [updated] = await getDb()
    .update(inventoryMaintenanceReminders)
    .set({
      lastCompletedAt: now,
      lastReminderAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(inventoryMaintenanceReminders.id, reminderId),
        eq(inventoryMaintenanceReminders.inventoryItemId, inventoryItemId),
      ),
    )
    .returning();

  if (!updated) {
    return null;
  }

  return attachLinks(updated);
}
