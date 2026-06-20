import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import {
  MAINTENANCE_REMINDER_TYPES,
  maintenanceLogReminders,
  maintenanceLogs,
  type MaintenanceLogReminder,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isMaintenanceLogReminderStale } from "@/lib/maintenance/reminder-interval";
import {
  parseReminderIntervalFromForm,
  parseReminderRecipientFromForm,
  reminderRecipientUserIdSchema,
  resolveReminderFields,
} from "@/lib/reminders/form";
import { reminderUnitSchema } from "@/lib/reminders/interval";
import type { MaintenanceActionState } from "@/lib/actions/maintenance";

const reminderIntervalCountSchema = z.coerce.number().int().min(1).max(999).optional().nullable();

export type MaintenanceLogReminderWithMeta = MaintenanceLogReminder & {
  stale: boolean;
};

export const createMaintenanceLogReminderSchema = z
  .object({
    maintenanceLogId: z.string().uuid(),
    title: z.string().trim().min(1, "Title is required").max(200),
    notes: z.string().trim().max(5000).optional(),
    reminderType: z.enum(MAINTENANCE_REMINDER_TYPES),
    reminderIntervalCount: reminderIntervalCountSchema,
    reminderIntervalUnit: reminderUnitSchema.optional().nullable(),
    dueAt: z.coerce.date().optional().nullable(),
    reminderRecipientUserId: reminderRecipientUserIdSchema,
  })
  .superRefine((data, ctx) => {
    if (data.reminderType === "interval") {
      if (data.reminderIntervalCount == null || data.reminderIntervalCount < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Interval count is required for recurring reminders",
          path: ["reminderIntervalCount"],
        });
      }
      if (!data.reminderIntervalUnit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Interval unit is required for recurring reminders",
          path: ["reminderIntervalUnit"],
        });
      }
    }
    if (data.reminderType === "one_time" && !data.dueAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Due date is required for one-time reminders",
        path: ["dueAt"],
      });
    }
  });

export const updateMaintenanceLogReminderSchema = z
  .object({
    reminderId: z.string().uuid(),
    maintenanceLogId: z.string().uuid(),
    title: z.string().trim().min(1, "Title is required").max(200),
    notes: z.string().trim().max(5000).optional(),
    reminderType: z.enum(MAINTENANCE_REMINDER_TYPES),
    reminderIntervalCount: reminderIntervalCountSchema,
    reminderIntervalUnit: reminderUnitSchema.optional().nullable(),
    dueAt: z.coerce.date().optional().nullable(),
    reminderRecipientUserId: reminderRecipientUserIdSchema,
  })
  .superRefine((data, ctx) => {
    if (data.reminderType === "interval") {
      if (data.reminderIntervalCount == null || data.reminderIntervalCount < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Interval count is required for recurring reminders",
          path: ["reminderIntervalCount"],
        });
      }
      if (!data.reminderIntervalUnit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Interval unit is required for recurring reminders",
          path: ["reminderIntervalUnit"],
        });
      }
    }
    if (data.reminderType === "one_time" && !data.dueAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Due date is required for one-time reminders",
        path: ["dueAt"],
      });
    }
  });

function revalidateMaintenanceReminderPaths(logId: string): void {
  revalidatePath("/maintenance");
  revalidatePath(`/maintenance/${logId}`);
  revalidatePath("/");
  revalidatePath("/reminders");
}

export async function loadMaintenanceLogRemindersForLog(
  logId: string,
  viewerUserId: string,
): Promise<MaintenanceLogReminderWithMeta[]> {
  const db = getDb();
  const reminders = await db
    .select()
    .from(maintenanceLogReminders)
    .where(eq(maintenanceLogReminders.maintenanceLogId, logId))
    .orderBy(maintenanceLogReminders.createdAt);

  const now = new Date();
  return reminders.map((reminder) => ({
    ...reminder,
    stale: isMaintenanceLogReminderStale(reminder, now, viewerUserId),
  }));
}

export async function createMaintenanceLogReminder(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const { user } = await requireUser();
  const reminderFields = parseReminderIntervalFromForm(formData);
  const reminderRecipientUserId = parseReminderRecipientFromForm(formData);
  const reminderTypeRaw = formData.get("reminderType");

  const parsed = createMaintenanceLogReminderSchema.safeParse({
    maintenanceLogId: formData.get("maintenanceLogId"),
    title: formData.get("title"),
    notes: formData.get("notes") || undefined,
    reminderType: reminderTypeRaw === "one_time" ? "one_time" : "interval",
    reminderIntervalCount: reminderFields.reminderIntervalCount,
    reminderIntervalUnit: reminderFields.reminderIntervalUnit,
    dueAt: formData.get("dueAt") || undefined,
    reminderRecipientUserId,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  const [log] = await db
    .select({ id: maintenanceLogs.id })
    .from(maintenanceLogs)
    .where(eq(maintenanceLogs.id, parsed.data.maintenanceLogId))
    .limit(1);
  if (!log) {
    return { error: "Maintenance log not found" };
  }

  const now = new Date();
  const resolved = resolveReminderFields(parsed.data);

  await db.insert(maintenanceLogReminders).values({
    id: crypto.randomUUID(),
    maintenanceLogId: parsed.data.maintenanceLogId,
    title: parsed.data.title,
    notes: parsed.data.notes ?? null,
    reminderType: parsed.data.reminderType,
    reminderIntervalCount:
      parsed.data.reminderType === "interval" ? resolved.reminderIntervalCount : null,
    reminderIntervalUnit:
      parsed.data.reminderType === "interval" ? resolved.reminderIntervalUnit : null,
    dueAt: parsed.data.reminderType === "one_time" ? (parsed.data.dueAt ?? null) : null,
    reminderRecipientUserId: resolved.reminderRecipientUserId,
    lastCompletedAt: null,
    lastReminderAt: null,
    createdByUserId: user.id,
    createdAt: now,
    updatedAt: now,
  });

  revalidateMaintenanceReminderPaths(parsed.data.maintenanceLogId);
  return { success: "Reminder added" };
}

export async function updateMaintenanceLogReminder(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  await requireUser();
  const reminderFields = parseReminderIntervalFromForm(formData);
  const reminderRecipientUserId = parseReminderRecipientFromForm(formData);
  const reminderTypeRaw = formData.get("reminderType");

  const parsed = updateMaintenanceLogReminderSchema.safeParse({
    reminderId: formData.get("reminderId"),
    maintenanceLogId: formData.get("maintenanceLogId"),
    title: formData.get("title"),
    notes: formData.get("notes") || undefined,
    reminderType: reminderTypeRaw === "one_time" ? "one_time" : "interval",
    reminderIntervalCount: reminderFields.reminderIntervalCount,
    reminderIntervalUnit: reminderFields.reminderIntervalUnit,
    dueAt: formData.get("dueAt") || undefined,
    reminderRecipientUserId,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(maintenanceLogReminders)
    .where(eq(maintenanceLogReminders.id, parsed.data.reminderId))
    .limit(1);
  if (!existing || existing.maintenanceLogId !== parsed.data.maintenanceLogId) {
    return { error: "Reminder not found" };
  }

  const now = new Date();
  const resolved = resolveReminderFields(parsed.data);

  await db
    .update(maintenanceLogReminders)
    .set({
      title: parsed.data.title,
      notes: parsed.data.notes ?? null,
      reminderType: parsed.data.reminderType,
      reminderIntervalCount:
        parsed.data.reminderType === "interval" ? resolved.reminderIntervalCount : null,
      reminderIntervalUnit:
        parsed.data.reminderType === "interval" ? resolved.reminderIntervalUnit : null,
      dueAt: parsed.data.reminderType === "one_time" ? (parsed.data.dueAt ?? null) : null,
      reminderRecipientUserId: resolved.reminderRecipientUserId,
      updatedAt: now,
    })
    .where(eq(maintenanceLogReminders.id, parsed.data.reminderId));

  revalidateMaintenanceReminderPaths(parsed.data.maintenanceLogId);
  return { success: "Reminder updated" };
}

export async function deleteMaintenanceLogReminder(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  await requireUser();
  const parsed = z
    .object({
      reminderId: z.string().uuid(),
      maintenanceLogId: z.string().uuid(),
    })
    .safeParse({
      reminderId: formData.get("reminderId"),
      maintenanceLogId: formData.get("maintenanceLogId"),
    });

  if (!parsed.success) {
    return { error: "Invalid reminder" };
  }

  await getDb()
    .delete(maintenanceLogReminders)
    .where(eq(maintenanceLogReminders.id, parsed.data.reminderId));

  revalidateMaintenanceReminderPaths(parsed.data.maintenanceLogId);
  return { success: "Reminder removed" };
}

export async function completeMaintenanceLogReminder(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  await requireUser();
  const parsed = z
    .object({
      reminderId: z.string().uuid(),
      maintenanceLogId: z.string().uuid(),
    })
    .safeParse({
      reminderId: formData.get("reminderId"),
      maintenanceLogId: formData.get("maintenanceLogId"),
    });

  if (!parsed.success) {
    return { error: "Invalid reminder" };
  }

  const now = new Date();
  await getDb()
    .update(maintenanceLogReminders)
    .set({
      lastCompletedAt: now,
      lastReminderAt: null,
      updatedAt: now,
    })
    .where(eq(maintenanceLogReminders.id, parsed.data.reminderId));

  revalidateMaintenanceReminderPaths(parsed.data.maintenanceLogId);
  return { success: "Marked complete" };
}
