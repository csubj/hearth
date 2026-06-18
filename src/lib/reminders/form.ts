import { z } from "zod";
import {
  DEFAULT_REMINDER_INTERVAL_COUNT,
  DEFAULT_REMINDER_INTERVAL_UNIT,
  reminderUnitSchema,
  type ReminderUnit,
} from "@/lib/reminders/interval";

export function parseRemindersEnabled(raw: FormDataEntryValue | null): boolean {
  return raw === "on" || raw === "true" || raw === "1";
}

export function parseReminderIntervalFromForm(formData: FormData): {
  reminderIntervalCount: number | null;
  reminderIntervalUnit: ReminderUnit | null;
  remindersEnabled: boolean;
} {
  const remindersEnabled = parseRemindersEnabled(formData.get("remindersEnabled"));
  if (!remindersEnabled) {
    return {
      remindersEnabled: false,
      reminderIntervalCount: null,
      reminderIntervalUnit: null,
    };
  }

  const countRaw = String(formData.get("reminderIntervalCount") ?? "").trim();
  const unitRaw = String(formData.get("reminderIntervalUnit") ?? "").trim();

  return {
    remindersEnabled: true,
    reminderIntervalCount: countRaw ? Number(countRaw) : DEFAULT_REMINDER_INTERVAL_COUNT,
    reminderIntervalUnit: unitRaw
      ? reminderUnitSchema.parse(unitRaw)
      : DEFAULT_REMINDER_INTERVAL_UNIT,
  };
}

export function parseReminderRecipientFromForm(formData: FormData): string | null {
  const scope = String(formData.get("reminderScope") ?? "household").trim();
  if (scope !== "user") {
    return null;
  }

  const userId = String(formData.get("reminderRecipientUserId") ?? "").trim();
  return userId || null;
}

export const reminderRecipientUserIdSchema = z.string().uuid().optional().nullable();

export function resolveReminderFields(input: {
  remindersEnabled?: boolean;
  reminderIntervalCount?: number | null;
  reminderIntervalUnit?: ReminderUnit | null;
  reminderRecipientUserId?: string | null;
}): {
  reminderIntervalCount: number | null;
  reminderIntervalUnit: ReminderUnit | null;
  reminderRecipientUserId: string | null;
} {
  if (input.remindersEnabled === false) {
    return {
      reminderIntervalCount: null,
      reminderIntervalUnit: null,
      reminderRecipientUserId: null,
    };
  }

  if (
    input.remindersEnabled !== true &&
    input.reminderIntervalCount === null &&
    input.reminderIntervalUnit === null
  ) {
    return {
      reminderIntervalCount: null,
      reminderIntervalUnit: null,
      reminderRecipientUserId: input.reminderRecipientUserId ?? null,
    };
  }

  if (
    input.remindersEnabled === true ||
    input.reminderIntervalCount != null ||
    input.reminderIntervalUnit != null
  ) {
    return {
      reminderIntervalCount: input.reminderIntervalCount ?? DEFAULT_REMINDER_INTERVAL_COUNT,
      reminderIntervalUnit: input.reminderIntervalUnit ?? DEFAULT_REMINDER_INTERVAL_UNIT,
      reminderRecipientUserId: input.reminderRecipientUserId ?? null,
    };
  }

  return {
    reminderIntervalCount: DEFAULT_REMINDER_INTERVAL_COUNT,
    reminderIntervalUnit: DEFAULT_REMINDER_INTERVAL_UNIT,
    reminderRecipientUserId: input.reminderRecipientUserId ?? null,
  };
}
