"use server";

import {
  addMaintenanceReminderLink as addMaintenanceReminderLinkAction,
  completeMaintenanceReminder as completeMaintenanceReminderAction,
  createMaintenanceReminder as createMaintenanceReminderAction,
  deleteMaintenanceReminder as deleteMaintenanceReminderAction,
  removeMaintenanceReminderLink as removeMaintenanceReminderLinkAction,
  updateMaintenanceReminder as updateMaintenanceReminderAction,
} from "@/lib/actions/inventory-maintenance";
import type { InventoryActionState } from "@/lib/actions/inventory";

export async function createMaintenanceReminder(
  prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  return createMaintenanceReminderAction(prev, formData);
}

export async function updateMaintenanceReminder(
  prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  return updateMaintenanceReminderAction(prev, formData);
}

export async function deleteMaintenanceReminder(
  prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  return deleteMaintenanceReminderAction(prev, formData);
}

export async function completeMaintenanceReminder(
  prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  return completeMaintenanceReminderAction(prev, formData);
}

export async function addMaintenanceReminderLink(
  prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  return addMaintenanceReminderLinkAction(prev, formData);
}

export async function removeMaintenanceReminderLink(
  prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  return removeMaintenanceReminderLinkAction(prev, formData);
}
