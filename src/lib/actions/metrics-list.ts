"use server";

import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { metricEntries, metrics, type MetricEntry } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isMetricStale } from "@/lib/metrics/reminder-interval";
import {
  DEFAULT_LIST_PAGE_SIZE,
  parseLimit,
  parseOffset,
  toListPage,
  type ListPage,
} from "@/lib/pagination/list";
import type { MetricListItem } from "@/lib/actions/metrics";

export type MetricListPageItem = MetricListItem & {
  previousEntry: MetricEntry | null;
  entryCount: number;
};

type EntryStats = {
  latest: MetricEntry | null;
  previous: MetricEntry | null;
  count: number;
};

async function loadEntryStats(metricId: string): Promise<EntryStats> {
  const db = getDb();
  const [recent, countRows] = await Promise.all([
    db
      .select()
      .from(metricEntries)
      .where(eq(metricEntries.metricId, metricId))
      .orderBy(desc(metricEntries.recordedAt), desc(metricEntries.createdAt))
      .limit(2),
    db
      .select({ count: sql<number>`count(*)` })
      .from(metricEntries)
      .where(eq(metricEntries.metricId, metricId)),
  ]);

  return {
    latest: recent[0] ?? null,
    previous: recent[1] ?? null,
    count: Number(countRows[0]?.count ?? 0),
  };
}

export async function listMetricsPage(
  offset = 0,
  limit = DEFAULT_LIST_PAGE_SIZE,
): Promise<ListPage<MetricListPageItem>> {
  const { user } = await requireUser();
  const safeOffset = parseOffset(offset);
  const safeLimit = parseLimit(limit);
  const db = getDb();

  const rows = await db
    .select()
    .from(metrics)
    .orderBy(desc(metrics.updatedAt))
    .limit(safeLimit + 1)
    .offset(safeOffset);

  const now = new Date();
  const items = await Promise.all(
    rows.map(async (metric): Promise<MetricListPageItem> => {
      const stats = await loadEntryStats(metric.id);
      return {
        ...metric,
        latestEntry: stats.latest,
        previousEntry: stats.previous,
        entryCount: stats.count,
        stale: isMetricStale(metric, stats.latest, now, user.id),
      };
    }),
  );

  return toListPage(items, safeOffset, safeLimit);
}
