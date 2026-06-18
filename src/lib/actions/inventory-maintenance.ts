import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import {
  inventoryItems,
  inventoryMaintenanceReminderLinks,
  inventoryMaintenanceReminders,
  type InventoryMaintenanceReminder,
  type InventoryMaintenanceReminderLink,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isMaintenanceReminderStale } from "@/lib/inventory/reminder-interval";
import {
  parseReminderIntervalFromForm,
  reminderRecipientUserIdSchema,
  resolveReminderFields,
} from "@/lib/reminders/form";
import { reminderUnitSchema } from "@/lib/reminders/interval";
import type { InventoryActionState } from "@/lib/actions/inventory";

const reminderIntervalCountSchema = z.coerce.number().int().min(1).max(999).optional().nullable();

export type MaintenanceReminderWithLinks = InventoryMaintenanceReminder & {
  links: InventoryMaintenanceReminderLink[];
  stale: boolean;
};

export const createMaintenanceReminderSchema = z
  .object({
    inventoryItemId: z.string().uuid(),
    title: z.string().trim().min(1, "Title is required").max(200),
    notes: z.string().trim().max(5000).optional(),
    reminderIntervalCount: reminderIntervalCountSchema,
    reminderIntervalUnit: reminderUnitSchema.optional().nullable(),
    reminderRecipientUserId: reminderRecipientUserIdSchema,
    remindersEnabled: z.boolean().optional(),
    linkLabel: z.string().trim().max(200).optional(),
    linkUrl: z.string().trim().url().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    const enabled = data.remindersEnabled ?? true;
    if (!enabled) {
      return;
    }
    if (data.reminderIntervalCount == null || data.reminderIntervalCount < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reminder interval is required when reminders are enabled",
        path: ["reminderIntervalCount"],
      });
    }
    if (!data.reminderIntervalUnit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reminder unit is required when reminders are enabled",
        path: ["reminderIntervalUnit"],
      });
    }
  });

export const updateMaintenanceReminderSchema = z
  .object({
    reminderId: z.string().uuid(),
    inventoryItemId: z.string().uuid(),
    title: z.string().trim().min(1, "Title is required").max(200),
    notes: z.string().trim().max(5000).optional(),
    reminderIntervalCount: reminderIntervalCountSchema,
    reminderIntervalUnit: reminderUnitSchema.optional().nullable(),
    reminderRecipientUserId: reminderRecipientUserIdSchema,
    remindersEnabled: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const enabled = data.remindersEnabled;
    if (enabled === false) {
      return;
    }
    if (enabled === true) {
      if (data.reminderIntervalCount == null || data.reminderIntervalCount < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Reminder interval is required when reminders are enabled",
          path: ["reminderIntervalCount"],
        });
      }
      if (!data.reminderIntervalUnit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Reminder unit is required when reminders are enabled",
          path: ["reminderIntervalUnit"],
        });
      }
    }
  });

function revalidateInventoryPaths(itemId: string): void {
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/");
  revalidatePath("/reminders");
}

export async function loadMaintenanceRemindersForItem(
  itemId: string,
  viewerUserId: string,
): Promise<MaintenanceReminderWithLinks[]> {
  const db = getDb();
  const reminders = await db
    .select()
    .from(inventoryMaintenanceReminders)
    .where(eq(inventoryMaintenanceReminders.inventoryItemId, itemId))
    .orderBy(inventoryMaintenanceReminders.createdAt);

  if (reminders.length === 0) {
    return [];
  }

  const reminderIds = reminders.map((reminder) => reminder.id);
  const allLinks =
    reminderIds.length > 0
      ? await db
          .select()
          .from(inventoryMaintenanceReminderLinks)
          .where(inArray(inventoryMaintenanceReminderLinks.reminderId, reminderIds))
      : [];

  const linksByReminder = new Map<string, InventoryMaintenanceReminderLink[]>();
  for (const link of allLinks) {
    const current = linksByReminder.get(link.reminderId) ?? [];
    current.push(link);
    linksByReminder.set(link.reminderId, current);
  }

  return reminders.map((reminder) => ({
    ...reminder,
    links: linksByReminder.get(reminder.id) ?? [],
    stale: isMaintenanceReminderStale(reminder, new Date(), viewerUserId),
  }));
}

export async function createMaintenanceReminder(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { user } = await requireUser();
  const reminderFields = parseReminderIntervalFromForm(formData);

  const parsed = createMaintenanceReminderSchema.safeParse({
    inventoryItemId: formData.get("inventoryItemId"),
    title: formData.get("title"),
    notes: formData.get("notes") || undefined,
    linkLabel: formData.get("linkLabel") || undefined,
    linkUrl: formData.get("linkUrl") || undefined,
    ...reminderFields,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const [item] = await getDb()
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(eq(inventoryItems.id, data.inventoryItemId))
    .limit(1);

  if (!item) {
    return { error: "Item not found." };
  }

  const now = new Date();
  const intervalFields = resolveReminderFields(data);
  const reminderId = crypto.randomUUID();

  await getDb()
    .insert(inventoryMaintenanceReminders)
    .values({
      id: reminderId,
      inventoryItemId: data.inventoryItemId,
      title: data.title,
      notes: data.notes?.length ? data.notes : null,
      ...intervalFields,
      lastCompletedAt: null,
      lastReminderAt: null,
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

  if (data.linkLabel && data.linkUrl) {
    await getDb().insert(inventoryMaintenanceReminderLinks).values({
      id: crypto.randomUUID(),
      reminderId,
      label: data.linkLabel,
      url: data.linkUrl,
      createdAt: now,
    });
  }

  revalidateInventoryPaths(data.inventoryItemId);
  return { success: "Maintenance reminder added." };
}

export async function updateMaintenanceReminder(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  await requireUser();
  const reminderFields = parseReminderIntervalFromForm(formData);

  const parsed = updateMaintenanceReminderSchema.safeParse({
    reminderId: formData.get("reminderId"),
    inventoryItemId: formData.get("inventoryItemId"),
    title: formData.get("title"),
    notes: formData.get("notes") || undefined,
    ...reminderFields,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(inventoryMaintenanceReminders)
    .where(
      and(
        eq(inventoryMaintenanceReminders.id, data.reminderId),
        eq(inventoryMaintenanceReminders.inventoryItemId, data.inventoryItemId),
      ),
    )
    .limit(1);

  if (!existing) {
    return { error: "Reminder not found." };
  }

  const now = new Date();
  const intervalFields = resolveReminderFields(data);

  await db
    .update(inventoryMaintenanceReminders)
    .set({
      title: data.title,
      notes: data.notes?.length ? data.notes : null,
      ...intervalFields,
      updatedAt: now,
    })
    .where(eq(inventoryMaintenanceReminders.id, data.reminderId));

  revalidateInventoryPaths(data.inventoryItemId);
  return { success: "Maintenance reminder updated." };
}

export async function deleteMaintenanceReminder(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  await requireUser();

  const parsed = z
    .object({
      reminderId: z.string().uuid(),
      inventoryItemId: z.string().uuid(),
    })
    .safeParse({
      reminderId: formData.get("reminderId"),
      inventoryItemId: formData.get("inventoryItemId"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { reminderId, inventoryItemId } = parsed.data;
  await getDb()
    .delete(inventoryMaintenanceReminders)
    .where(
      and(
        eq(inventoryMaintenanceReminders.id, reminderId),
        eq(inventoryMaintenanceReminders.inventoryItemId, inventoryItemId),
      ),
    );

  revalidateInventoryPaths(inventoryItemId);
  return { success: "Maintenance reminder removed." };
}

export async function completeMaintenanceReminder(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  await requireUser();

  const parsed = z
    .object({
      reminderId: z.string().uuid(),
      inventoryItemId: z.string().uuid(),
    })
    .safeParse({
      reminderId: formData.get("reminderId"),
      inventoryItemId: formData.get("inventoryItemId"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { reminderId, inventoryItemId } = parsed.data;
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
    return { error: "Reminder not found." };
  }

  revalidateInventoryPaths(inventoryItemId);
  return { success: "Marked maintenance complete." };
}

export async function addMaintenanceReminderLink(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  await requireUser();

  const parsed = z
    .object({
      reminderId: z.string().uuid(),
      inventoryItemId: z.string().uuid(),
      label: z.string().trim().min(1).max(200),
      url: z.string().trim().url().max(2000),
    })
    .safeParse({
      reminderId: formData.get("reminderId"),
      inventoryItemId: formData.get("inventoryItemId"),
      label: formData.get("label"),
      url: formData.get("url"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { reminderId, inventoryItemId, label, url } = parsed.data;
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
    return { error: "Reminder not found." };
  }

  await getDb().insert(inventoryMaintenanceReminderLinks).values({
    id: crypto.randomUUID(),
    reminderId,
    label,
    url,
    createdAt: new Date(),
  });

  revalidateInventoryPaths(inventoryItemId);
  return { success: "Link added." };
}

export async function removeMaintenanceReminderLink(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  await requireUser();

  const parsed = z
    .object({
      linkId: z.string().uuid(),
      reminderId: z.string().uuid(),
      inventoryItemId: z.string().uuid(),
    })
    .safeParse({
      linkId: formData.get("linkId"),
      reminderId: formData.get("reminderId"),
      inventoryItemId: formData.get("inventoryItemId"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { linkId, reminderId, inventoryItemId } = parsed.data;
  await getDb()
    .delete(inventoryMaintenanceReminderLinks)
    .where(
      and(
        eq(inventoryMaintenanceReminderLinks.id, linkId),
        eq(inventoryMaintenanceReminderLinks.reminderId, reminderId),
      ),
    );

  revalidateInventoryPaths(inventoryItemId);
  return { success: "Link removed." };
}
