import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { trackerEntries, trackers, type Tracker, type TrackerEntry } from "@/db/schema";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";

export const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export const createTrackerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  unit: z.string().trim().max(50).optional(),
});

export const updateTrackerSchema = z.object({
  trackerId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(200),
  unit: z.string().trim().max(50).optional(),
});

export const addEntrySchema = z.object({
  trackerId: z.string().uuid(),
  value: z.string().trim().min(1, "Value is required").max(500),
  note: z.string().trim().max(5000).optional(),
  recordedAt: z.coerce.date().optional(),
});

export type TrackerActionState = {
  error?: string;
  success?: boolean;
};

export type TrackerListItem = Tracker & {
  latestEntry: TrackerEntry | null;
  stale: boolean;
};

export type TrackerHomeItem = TrackerListItem;

export function isTrackerStale(
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

function formatTrackerValue(value: string, unit: string | null): string {
  return unit ? `${value} ${unit}` : value;
}

async function getLatestEntriesByTracker(): Promise<Map<string, TrackerEntry>> {
  const db = getDb();
  const rows = await db.select().from(trackerEntries).orderBy(desc(trackerEntries.recordedAt));

  const latest = new Map<string, TrackerEntry>();
  for (const row of rows) {
    if (!latest.has(row.trackerId)) {
      latest.set(row.trackerId, row);
    }
  }
  return latest;
}

function toTrackerListItem(tracker: Tracker, latestEntry: TrackerEntry | null): TrackerListItem {
  return {
    ...tracker,
    latestEntry,
    stale: isTrackerStale(latestEntry?.recordedAt ?? null),
  };
}

export async function listTrackersWithLatest(): Promise<TrackerListItem[]> {
  const db = getDb();
  const allTrackers = await db.select().from(trackers).orderBy(desc(trackers.updatedAt));
  const latestByTracker = await getLatestEntriesByTracker();

  return allTrackers.map((tracker) =>
    toTrackerListItem(tracker, latestByTracker.get(tracker.id) ?? null),
  );
}

export async function getTrackerWithEntries(
  trackerId: string,
): Promise<{ tracker: Tracker; entries: TrackerEntry[] } | null> {
  const db = getDb();
  const [tracker] = await db.select().from(trackers).where(eq(trackers.id, trackerId)).limit(1);
  if (!tracker) {
    return null;
  }

  const entries = await db
    .select()
    .from(trackerEntries)
    .where(eq(trackerEntries.trackerId, trackerId))
    .orderBy(desc(trackerEntries.recordedAt), desc(trackerEntries.createdAt));

  return { tracker, entries };
}

export async function getTrackersHomeSummary(limit = 5): Promise<TrackerHomeItem[]> {
  const items = await listTrackersWithLatest();
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

export async function createTrackerRecord(
  userId: string,
  input: z.infer<typeof createTrackerSchema>,
): Promise<Tracker> {
  const now = new Date();
  const row: Tracker = {
    id: crypto.randomUUID(),
    name: input.name,
    unit: input.unit?.length ? input.unit : null,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  };

  await getDb().insert(trackers).values(row);
  return row;
}

export async function updateTrackerRecord(
  _userId: string,
  input: z.infer<typeof updateTrackerSchema>,
): Promise<Tracker | null> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(trackers)
    .where(eq(trackers.id, input.trackerId))
    .limit(1);
  if (!existing) {
    return null;
  }

  const now = new Date();
  const [updated] = await db
    .update(trackers)
    .set({
      name: input.name,
      unit: input.unit?.length ? input.unit : null,
      updatedAt: now,
    })
    .where(eq(trackers.id, input.trackerId))
    .returning();

  return updated ?? null;
}

export async function addEntryRecord(
  userId: string,
  input: z.infer<typeof addEntrySchema>,
): Promise<{ entry: TrackerEntry; tracker: Tracker } | null> {
  const db = getDb();
  const [tracker] = await db
    .select()
    .from(trackers)
    .where(eq(trackers.id, input.trackerId))
    .limit(1);
  if (!tracker) {
    return null;
  }

  const now = new Date();
  const recordedAt = input.recordedAt ?? now;
  const entry: TrackerEntry = {
    id: crypto.randomUUID(),
    trackerId: input.trackerId,
    value: input.value,
    note: input.note?.length ? input.note : null,
    recordedAt,
    createdByUserId: userId,
    createdAt: now,
  };

  await db.insert(trackerEntries).values(entry);
  await db.update(trackers).set({ updatedAt: now }).where(eq(trackers.id, input.trackerId));

  await emitHouseholdActivity({
    type: "tracker.entry_added",
    actorId: userId,
    entityType: "tracker_entry",
    entityId: entry.id,
    summary: `logged ${formatTrackerValue(entry.value, tracker.unit)} on ${tracker.name}`,
  });

  if (entry.note) {
    await emitMentions({
      body: entry.note,
      entityType: "tracker_entry",
      entityId: entry.id,
      actorId: userId,
    });
  }

  return { entry, tracker };
}

/** Test-only: create tracker tables when migrations are not yet generated. */
export function ensureTrackerTablesForTests(): void {
  const db = getDb();
  db.run(sql`
    CREATE TABLE IF NOT EXISTS trackers (
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
    CREATE TABLE IF NOT EXISTS tracker_entries (
      id text PRIMARY KEY NOT NULL,
      tracker_id text NOT NULL,
      value text NOT NULL,
      note text,
      recorded_at integer NOT NULL,
      created_by_user_id text NOT NULL,
      created_at integer NOT NULL,
      FOREIGN KEY (tracker_id) REFERENCES trackers(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    )
  `);
  db.run(sql`
    CREATE INDEX IF NOT EXISTS tracker_entries_tracker_id_recorded_at_idx
    ON tracker_entries (tracker_id, recorded_at)
  `);
}
