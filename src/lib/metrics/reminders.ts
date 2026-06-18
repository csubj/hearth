import { desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { metricEntries, metrics } from "@/db/schema";
import {
  formatReminderIntervalPhrase,
  hasReminderInterval,
  isMetricDueForReminder,
} from "@/lib/metrics/reminder-interval";
import { emitMetricReminder } from "@/lib/notifications/emit";

async function getLatestEntryForMetric(metricId: string) {
  const [entry] = await getDb()
    .select()
    .from(metricEntries)
    .where(eq(metricEntries.metricId, metricId))
    .orderBy(desc(metricEntries.recordedAt), desc(metricEntries.createdAt))
    .limit(1);

  return entry ?? null;
}

export async function processMetricReminders(): Promise<void> {
  const db = getDb();
  const allMetrics = await db
    .select()
    .from(metrics)
    .where(isNotNull(metrics.reminderIntervalCount));

  const now = new Date();

  for (const metric of allMetrics) {
    if (!hasReminderInterval(metric)) {
      continue;
    }

    const latestEntry = await getLatestEntryForMetric(metric.id);
    if (!isMetricDueForReminder(metric, latestEntry, now)) {
      continue;
    }

    const intervalLabel = formatReminderIntervalPhrase(
      metric.reminderIntervalCount!,
      metric.reminderIntervalUnit!,
    );

    await emitMetricReminder({
      metricId: metric.id,
      metricName: metric.name,
      intervalLabel,
      recipientUserId: metric.reminderRecipientUserId,
    });

    await db
      .update(metrics)
      .set({ lastReminderAt: now })
      .where(eq(metrics.id, metric.id));
  }
}
