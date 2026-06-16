import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { metricEntries, metrics, users, type Metric, type MetricEntry } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";

export const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export const createMetricSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  unit: z.string().trim().max(50).optional(),
});

export const updateMetricSchema = z.object({
  metricId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(200),
  unit: z.string().trim().max(50).optional(),
});

export const addEntrySchema = z.object({
  metricId: z.string().uuid(),
  value: z.string().trim().min(1, "Value is required").max(500),
  note: z.string().trim().max(5000).optional(),
  recordedAt: z.coerce.date().optional(),
});

export type MetricActionState = {
  error?: string;
  success?: boolean;
};

export type MetricListItem = Metric & {
  latestEntry: MetricEntry | null;
  stale: boolean;
};

export type MetricHomeItem = MetricListItem;

export function isMetricStale(
  latestRecordedAt: Date | null | undefined,
  now = Date.now(),
): boolean {
  if (!latestRecordedAt) {
    return true;
  }
  return now - latestRecordedAt.getTime() > STALE_THRESHOLD_MS;
}

export function parseRecordedAt(raw: string | null): Date | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

function formatMetricValue(value: string, unit: string | null): string {
  return unit ? `${value} ${unit}` : value;
}

async function getLatestEntryForMetric(metricId: string): Promise<MetricEntry | null> {
  const [entry] = await getDb()
    .select()
    .from(metricEntries)
    .where(eq(metricEntries.metricId, metricId))
    .orderBy(desc(metricEntries.recordedAt), desc(metricEntries.createdAt))
    .limit(1);

  return entry ?? null;
}

async function getLatestEntriesByMetric(metricIds: string[]): Promise<Map<string, MetricEntry>> {
  const latest = new Map<string, MetricEntry>();
  await Promise.all(
    metricIds.map(async (metricId) => {
      const entry = await getLatestEntryForMetric(metricId);
      if (entry) {
        latest.set(metricId, entry);
      }
    }),
  );
  return latest;
}

function toMetricListItem(metric: Metric, latestEntry: MetricEntry | null): MetricListItem {
  return {
    ...metric,
    latestEntry,
    stale: isMetricStale(latestEntry?.recordedAt ?? null),
  };
}

export async function listMetricsWithLatest(): Promise<MetricListItem[]> {
  await requireUser();
  const db = getDb();
  const allMetrics = await db.select().from(metrics).orderBy(desc(metrics.updatedAt));
  const latestByMetric = await getLatestEntriesByMetric(allMetrics.map((metric) => metric.id));

  return allMetrics.map((metric) =>
    toMetricListItem(metric, latestByMetric.get(metric.id) ?? null),
  );
}

export async function getMetricWithEntries(
  metricId: string,
): Promise<{ metric: Metric; entries: MetricEntry[] } | null> {
  await requireUser();
  const db = getDb();
  const [metric] = await db.select().from(metrics).where(eq(metrics.id, metricId)).limit(1);
  if (!metric) {
    return null;
  }

  const entries = await db
    .select()
    .from(metricEntries)
    .where(eq(metricEntries.metricId, metricId))
    .orderBy(desc(metricEntries.recordedAt), desc(metricEntries.createdAt));

  return { metric, entries };
}

export async function getMetricsHomeSummary(limit = 5): Promise<MetricHomeItem[]> {
  await requireUser();
  const items = await listMetricsWithLatest();
  return items
    .sort((a, b) => {
      if (a.stale !== b.stale) {
        return a.stale ? -1 : 1;
      }
      const aTime = a.latestEntry?.recordedAt?.getTime() ?? a.updatedAt.getTime();
      const bTime = b.latestEntry?.recordedAt?.getTime() ?? b.updatedAt.getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
}

export async function createMetricRecord(
  userId: string,
  input: z.infer<typeof createMetricSchema>,
): Promise<Metric> {
  const now = new Date();
  const row: Metric = {
    id: crypto.randomUUID(),
    name: input.name,
    unit: input.unit?.length ? input.unit : null,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  };

  await getDb().insert(metrics).values(row);
  return row;
}

export async function updateMetricRecord(
  _userId: string,
  input: z.infer<typeof updateMetricSchema>,
): Promise<Metric | null> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(metrics)
    .where(eq(metrics.id, input.metricId))
    .limit(1);
  if (!existing) {
    return null;
  }

  const now = new Date();
  const [updated] = await db
    .update(metrics)
    .set({
      name: input.name,
      unit: input.unit?.length ? input.unit : null,
      updatedAt: now,
    })
    .where(eq(metrics.id, input.metricId))
    .returning();

  return updated ?? null;
}

export async function addEntryRecord(
  userId: string,
  input: z.infer<typeof addEntrySchema>,
): Promise<{ entry: MetricEntry; metric: Metric } | null> {
  const db = getDb();
  const [metric] = await db
    .select()
    .from(metrics)
    .where(eq(metrics.id, input.metricId))
    .limit(1);
  if (!metric) {
    return null;
  }

  const [actor] = await db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const actorName = actor ? (actor.displayName ?? actor.username) : "Someone";

  const now = new Date();
  const recordedAt = input.recordedAt ?? now;
  const entry: MetricEntry = {
    id: crypto.randomUUID(),
    metricId: input.metricId,
    value: input.value,
    note: input.note?.length ? input.note : null,
    recordedAt,
    createdByUserId: userId,
    createdAt: now,
  };

  await db.insert(metricEntries).values(entry);
  await db.update(metrics).set({ updatedAt: now }).where(eq(metrics.id, input.metricId));

  await emitHouseholdActivity({
    type: "metric.entry_added",
    actorId: userId,
    entityType: "metric_entry",
    entityId: entry.id,
    summary: `${actorName} logged ${formatMetricValue(entry.value, metric.unit)} on ${metric.name}`,
  });

  if (entry.note) {
    await emitMentions({
      body: entry.note,
      entityType: "metric_entry",
      entityId: entry.id,
      actorId: userId,
    });
  }

  return { entry, metric };
}

/** Test-only: create metric tables when migrations are not yet generated. */
export function ensureMetricTablesForTests(): void {
  const db = getDb();
  db.run(sql`
    CREATE TABLE IF NOT EXISTS metrics (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      unit text,
      created_by_user_id text NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    )
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS metric_entries (
      id text PRIMARY KEY NOT NULL,
      metric_id text NOT NULL,
      value text NOT NULL,
      note text,
      recorded_at integer NOT NULL,
      created_by_user_id text NOT NULL,
      created_at integer NOT NULL,
      FOREIGN KEY (metric_id) REFERENCES metrics(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    )
  `);
  db.run(sql`
    CREATE INDEX IF NOT EXISTS metric_entries_metric_id_recorded_at_idx
    ON metric_entries (metric_id, recorded_at)
  `);
}
