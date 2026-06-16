"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  addEntryRecord,
  addEntrySchema,
  createTrackerRecord,
  createTrackerSchema,
  parseRecordedAt,
  updateTrackerRecord,
  updateTrackerSchema,
  type TrackerActionState,
} from "@/lib/actions/trackers";

function revalidateTrackerPaths(trackerId?: string): void {
  revalidatePath("/");
  revalidatePath("/trackers");
  if (trackerId) {
    revalidatePath(`/trackers/${trackerId}`);
  }
}

export async function createTracker(
  _prev: TrackerActionState,
  formData: FormData,
): Promise<TrackerActionState> {
  const { user } = await requireUser();
  const parsed = createTrackerSchema.safeParse({
    name: formData.get("name"),
    unit: formData.get("unit") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await createTrackerRecord(user.id, parsed.data);
  revalidateTrackerPaths();
  return { success: true };
}

export async function updateTracker(
  _prev: TrackerActionState,
  formData: FormData,
): Promise<TrackerActionState> {
  const { user } = await requireUser();
  const parsed = updateTrackerSchema.safeParse({
    trackerId: formData.get("trackerId"),
    name: formData.get("name"),
    unit: formData.get("unit") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const updated = await updateTrackerRecord(user.id, parsed.data);
  if (!updated) {
    return { error: "Tracker not found" };
  }

  revalidateTrackerPaths(updated.id);
  return { success: true };
}

export async function addEntry(
  _prev: TrackerActionState,
  formData: FormData,
): Promise<TrackerActionState> {
  const { user } = await requireUser();
  const parsed = addEntrySchema.safeParse({
    trackerId: formData.get("trackerId"),
    value: formData.get("value"),
    note: formData.get("note") || undefined,
    recordedAt: parseRecordedAt(String(formData.get("recordedAt") ?? "")),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await addEntryRecord(user.id, parsed.data);
  if (!result) {
    return { error: "Tracker not found" };
  }

  revalidateTrackerPaths(result.tracker.id);
  return { success: true };
}

export type { TrackerActionState };
