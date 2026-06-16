"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  addEntryRecord,
  addEntrySchema,
  createMetricRecord,
  createMetricSchema,
  parseRecordedAt,
  updateMetricRecord,
  updateMetricSchema,
  type MetricActionState,
} from "@/lib/actions/metrics";

function revalidateMetricPaths(metricId?: string): void {
  revalidatePath("/");
  revalidatePath("/metrics");
  if (metricId) {
    revalidatePath(`/metrics/${metricId}`);
  }
}

export async function createMetric(
  _prev: MetricActionState,
  formData: FormData,
): Promise<MetricActionState> {
  const { user } = await requireUser();
  const parsed = createMetricSchema.safeParse({
    name: formData.get("name"),
    unit: formData.get("unit") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await createMetricRecord(user.id, parsed.data);
  revalidateMetricPaths();
  return { success: true };
}

export async function updateMetric(
  _prev: MetricActionState,
  formData: FormData,
): Promise<MetricActionState> {
  const { user } = await requireUser();
  const parsed = updateMetricSchema.safeParse({
    metricId: formData.get("metricId"),
    name: formData.get("name"),
    unit: formData.get("unit") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const updated = await updateMetricRecord(user.id, parsed.data);
  if (!updated) {
    return { error: "Metric not found" };
  }

  revalidateMetricPaths(updated.id);
  return { success: true };
}

export async function addEntry(
  _prev: MetricActionState,
  formData: FormData,
): Promise<MetricActionState> {
  const { user } = await requireUser();
  const parsed = addEntrySchema.safeParse({
    metricId: formData.get("metricId"),
    value: formData.get("value"),
    note: formData.get("note") || undefined,
    recordedAt: parseRecordedAt(String(formData.get("recordedAt") ?? "")),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await addEntryRecord(user.id, parsed.data);
  if (!result) {
    return { error: "Metric not found" };
  }

  revalidateMetricPaths(result.metric.id);
  return { success: true };
}

export type { MetricActionState };
