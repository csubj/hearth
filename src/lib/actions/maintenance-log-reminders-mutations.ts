"use server";

import {
  completeMaintenanceLogReminder as completeMaintenanceLogReminderAction,
  createMaintenanceLogReminder as createMaintenanceLogReminderAction,
  deleteMaintenanceLogReminder as deleteMaintenanceLogReminderAction,
  updateMaintenanceLogReminder as updateMaintenanceLogReminderAction,
} from "@/lib/actions/maintenance-log-reminders";
import type { MaintenanceActionState } from "@/lib/actions/maintenance";

export async function createMaintenanceLogReminder(
  prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  return createMaintenanceLogReminderAction(prev, formData);
}

export async function updateMaintenanceLogReminder(
  prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  return updateMaintenanceLogReminderAction(prev, formData);
}

export async function deleteMaintenanceLogReminder(
  prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  return deleteMaintenanceLogReminderAction(prev, formData);
}

export async function completeMaintenanceLogReminder(
  prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  return completeMaintenanceLogReminderAction(prev, formData);
}
