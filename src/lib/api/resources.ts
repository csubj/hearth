import { and, desc, eq, lt, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  events,
  metricEntries,
  metrics,
  projects,
  restaurants,
  streamEntries,
  type Event,
  type Metric,
  type MetricEntry,
  type Project,
  type Restaurant,
  type StreamEntry,
} from "@/db/schema";
import type { AuthUser } from "@/lib/auth/lucia";
import {
  addEntryRecord,
  createMetricRecord,
  updateMetricRecord,
} from "@/lib/actions/metrics";
import { displayName } from "@/lib/auth/session";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";
import { combineRestaurantMentionText } from "@/lib/restaurants/mention-text";
import { decodeCursor, paginateRows, type PaginationQuery } from "@/lib/api/pagination";
import { toIso } from "@/lib/api/serialize";
import type {
  createEventSchema,
  createMetricEntrySchema,
  createMetricSchema,
  createProjectSchema,
  createRestaurantSchema,
  createStreamEntrySchema,
  updateEventSchema,
  updateMetricEntrySchema,
  updateMetricSchema,
  updateProjectSchema,
  updateRestaurantSchema,
  updateStreamEntrySchema,
} from "@/lib/api/schemas";
import type { z } from "zod";

export function serializeStreamEntry(row: StreamEntry) {
  return {
    id: row.id,
    body: row.body,
    isPinned: row.isPinned,
    doneAt: toIso(row.doneAt),
    roughWhen: row.roughWhen,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

export function serializeRestaurant(row: Restaurant) {
  return {
    id: row.id,
    name: row.name,
    neighborhood: row.neighborhood,
    address: row.address,
    notes: row.notes,
    status: row.status,
    rating: row.rating,
    visitNote: row.visitNote,
    visitedAt: toIso(row.visitedAt),
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

export function serializeProject(row: Project) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

export function serializeMetric(row: Metric) {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    createdByUserId: row.createdByUserId,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

export function serializeMetricEntry(row: MetricEntry) {
  return {
    id: row.id,
    metricId: row.metricId,
    value: row.value,
    note: row.note,
    recordedAt: toIso(row.recordedAt)!,
    createdByUserId: row.createdByUserId,
    createdAt: toIso(row.createdAt)!,
  };
}

export function serializeEvent(row: Event) {
  return {
    id: row.id,
    title: row.title,
    startsAt: toIso(row.startsAt)!,
    location: row.location,
    link: row.link,
    note: row.note,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function cursorCondition(
  createdAt: AnyColumn,
  id: AnyColumn,
  cursor: string,
): SQL | undefined {
  const decoded = decodeCursor(cursor);
  if (!decoded) {
    return undefined;
  }
  const cursorDate = new Date(decoded.t);
  return or(
    lt(createdAt, cursorDate),
    and(eq(createdAt, cursorDate), lt(id, decoded.id)),
  );
}

export async function listStreamEntries(query: PaginationQuery) {
  const db = getDb();
  const conditions = [];
  const cursorFilter = query.cursor
    ? cursorCondition(streamEntries.createdAt, streamEntries.id, query.cursor)
    : undefined;
  if (cursorFilter) {
    conditions.push(cursorFilter);
  }

  const rows = await db
    .select()
    .from(streamEntries)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(streamEntries.createdAt), desc(streamEntries.id))
    .limit(query.limit + 1);

  return paginateRows(rows, query.limit);
}

export async function getStreamEntry(id: string) {
  const [row] = await getDb()
    .select()
    .from(streamEntries)
    .where(eq(streamEntries.id, id))
    .limit(1);
  return row ?? null;
}

export async function createStreamEntry(
  user: AuthUser,
  input: z.infer<typeof createStreamEntrySchema>,
) {
  const now = new Date();
  const id = crypto.randomUUID();
  const row: StreamEntry = {
    id,
    body: input.body,
    roughWhen: input.roughWhen ?? null,
    isPinned: input.isPinned ?? false,
    doneAt: null,
    createdByUserId: user.id,
    updatedByUserId: user.id,
    createdAt: now,
    updatedAt: now,
  };

  await getDb().insert(streamEntries).values(row);

  const name = displayName(user);
  await emitHouseholdActivity({
    type: "stream.created",
    actorId: user.id,
    entityType: "stream_entry",
    entityId: id,
    summary: `${name} added a stream note`,
  });
  await emitMentions({
    body: input.body,
    entityType: "stream_entry",
    entityId: id,
    actorId: user.id,
  });

  return row;
}

export async function updateStreamEntry(
  user: AuthUser,
  id: string,
  input: z.infer<typeof updateStreamEntrySchema>,
) {
  const db = getDb();
  const [existing] = await db.select().from(streamEntries).where(eq(streamEntries.id, id)).limit(1);
  if (!existing) {
    return null;
  }

  const now = new Date();
  const [updated] = await db
    .update(streamEntries)
    .set({
      body: input.body ?? existing.body,
      roughWhen: input.roughWhen !== undefined ? input.roughWhen : existing.roughWhen,
      isPinned: input.isPinned ?? existing.isPinned,
      doneAt: input.done === true ? now : input.done === false ? null : existing.doneAt,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(streamEntries.id, id))
    .returning();

  if (!updated) {
    return null;
  }

  const name = displayName(user);
  await emitHouseholdActivity({
    type: "stream.updated",
    actorId: user.id,
    entityType: "stream_entry",
    entityId: id,
    summary: `${name} updated a stream note`,
  });
  if (input.body) {
    await emitMentions({
      body: input.body,
      entityType: "stream_entry",
      entityId: id,
      actorId: user.id,
    });
  }

  return updated;
}

export async function deleteStreamEntry(id: string) {
  const db = getDb();
  const [existing] = await db.select().from(streamEntries).where(eq(streamEntries.id, id)).limit(1);
  if (!existing) {
    return false;
  }
  await db.delete(streamEntries).where(eq(streamEntries.id, id));
  return true;
}

export async function listRestaurantsApi(query: PaginationQuery) {
  const db = getDb();
  const conditions = [];
  const cursorFilter = query.cursor
    ? cursorCondition(restaurants.createdAt, restaurants.id, query.cursor)
    : undefined;
  if (cursorFilter) {
    conditions.push(cursorFilter);
  }

  const rows = await db
    .select()
    .from(restaurants)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(restaurants.createdAt), desc(restaurants.id))
    .limit(query.limit + 1);

  return paginateRows(rows, query.limit);
}

export async function getRestaurantApi(id: string) {
  const [row] = await getDb().select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  return row ?? null;
}

export async function createRestaurantApi(
  user: AuthUser,
  input: z.infer<typeof createRestaurantSchema>,
) {
  const now = new Date();
  const id = crypto.randomUUID();
  const row: Restaurant = {
    id,
    name: input.name,
    neighborhood: input.neighborhood ?? null,
    address: input.address ?? null,
    notes: input.notes ?? null,
    status: input.status ?? "want_to_try",
    rating: null,
    visitNote: null,
    visitedAt: null,
    createdByUserId: user.id,
    updatedByUserId: user.id,
    createdAt: now,
    updatedAt: now,
  };

  await getDb().insert(restaurants).values(row);

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "restaurant.created",
    actorId: user.id,
    entityType: "restaurant",
    entityId: id,
    summary: `${actor} added "${input.name}"`,
  });
  const mentionText = combineRestaurantMentionText(input.notes ?? null, null);
  if (mentionText) {
    await emitMentions({
      body: mentionText,
      entityType: "restaurant",
      entityId: id,
      actorId: user.id,
    });
  }

  return row;
}

export async function updateRestaurantApi(
  user: AuthUser,
  id: string,
  input: z.infer<typeof updateRestaurantSchema>,
) {
  const db = getDb();
  const [existing] = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  if (!existing) {
    return null;
  }

  const now = new Date();
  const status = input.status ?? existing.status;
  const visitedAt =
    input.visitedAt !== undefined
      ? input.visitedAt
        ? new Date(input.visitedAt)
        : null
      : status === "visited" && existing.status !== "visited"
        ? now
        : existing.visitedAt;

  const [updated] = await db
    .update(restaurants)
    .set({
      name: input.name ?? existing.name,
      neighborhood:
        input.neighborhood !== undefined ? input.neighborhood : existing.neighborhood,
      address: input.address !== undefined ? input.address : existing.address,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      status,
      rating: input.rating !== undefined ? input.rating : existing.rating,
      visitNote: input.visitNote !== undefined ? input.visitNote : existing.visitNote,
      visitedAt,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(restaurants.id, id))
    .returning();

  if (!updated) {
    return null;
  }

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "restaurant.updated",
    actorId: user.id,
    entityType: "restaurant",
    entityId: id,
    summary: `${actor} updated "${updated.name}"`,
  });

  return updated;
}

export async function deleteRestaurantApi(id: string) {
  const db = getDb();
  const [existing] = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  if (!existing) {
    return false;
  }
  await db.delete(restaurants).where(eq(restaurants.id, id));
  return true;
}

export async function listProjectsApi(query: PaginationQuery) {
  const db = getDb();
  const conditions = [];
  const cursorFilter = query.cursor
    ? cursorCondition(projects.createdAt, projects.id, query.cursor)
    : undefined;
  if (cursorFilter) {
    conditions.push(cursorFilter);
  }

  const rows = await db
    .select()
    .from(projects)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(projects.createdAt), desc(projects.id))
    .limit(query.limit + 1);

  return paginateRows(rows, query.limit);
}

export async function getProjectApi(id: string) {
  const [row] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

export async function createProjectApi(user: AuthUser, input: z.infer<typeof createProjectSchema>) {
  const now = new Date();
  const id = crypto.randomUUID();
  const row: Project = {
    id,
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? "idea",
    createdByUserId: user.id,
    updatedByUserId: user.id,
    createdAt: now,
    updatedAt: now,
  };

  await getDb().insert(projects).values(row);

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "project.created",
    actorId: user.id,
    entityType: "project",
    entityId: id,
    summary: `${actor} added "${input.title}"`,
  });
  if (input.description) {
    await emitMentions({
      body: input.description,
      entityType: "project",
      entityId: id,
      actorId: user.id,
    });
  }

  return row;
}

export async function updateProjectApi(
  user: AuthUser,
  id: string,
  input: z.infer<typeof updateProjectSchema>,
) {
  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!existing) {
    return null;
  }

  const now = new Date();
  const [updated] = await db
    .update(projects)
    .set({
      title: input.title ?? existing.title,
      description: input.description !== undefined ? input.description : existing.description,
      status: input.status ?? existing.status,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(projects.id, id))
    .returning();

  if (!updated) {
    return null;
  }

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "project.updated",
    actorId: user.id,
    entityType: "project",
    entityId: id,
    summary: `${actor} updated "${updated.title}"`,
  });

  return updated;
}

export async function deleteProjectApi(id: string) {
  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!existing) {
    return false;
  }
  await db.delete(projects).where(eq(projects.id, id));
  return true;
}

export async function listMetricsApi(query: PaginationQuery) {
  const db = getDb();
  const conditions = [];
  const cursorFilter = query.cursor
    ? cursorCondition(metrics.createdAt, metrics.id, query.cursor)
    : undefined;
  if (cursorFilter) {
    conditions.push(cursorFilter);
  }

  const rows = await db
    .select()
    .from(metrics)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(metrics.createdAt), desc(metrics.id))
    .limit(query.limit + 1);

  return paginateRows(rows, query.limit);
}

export async function getMetricApi(id: string) {
  const [row] = await getDb().select().from(metrics).where(eq(metrics.id, id)).limit(1);
  return row ?? null;
}

export async function createMetricApi(user: AuthUser, input: z.infer<typeof createMetricSchema>) {
  return createMetricRecord(user.id, input);
}

export async function updateMetricApi(
  user: AuthUser,
  id: string,
  input: z.infer<typeof updateMetricSchema>,
) {
  const existing = await getMetricApi(id);
  if (!existing) {
    return null;
  }

  return updateMetricRecord(user.id, {
    metricId: id,
    name: input.name ?? existing.name,
    unit: input.unit !== undefined ? (input.unit ?? undefined) : (existing.unit ?? undefined),
  });
}

export async function deleteMetricApi(id: string) {
  const db = getDb();
  const [existing] = await db.select().from(metrics).where(eq(metrics.id, id)).limit(1);
  if (!existing) {
    return false;
  }
  await db.delete(metrics).where(eq(metrics.id, id));
  return true;
}

function metricEntryCursorCondition(cursor: string) {
  const decoded = decodeCursor(cursor);
  if (!decoded) {
    return undefined;
  }
  const cursorDate = new Date(decoded.t);
  return or(
    lt(metricEntries.recordedAt, cursorDate),
    and(eq(metricEntries.recordedAt, cursorDate), lt(metricEntries.id, decoded.id)),
  );
}

export async function listMetricEntriesApi(metricId: string, query: PaginationQuery) {
  const db = getDb();
  const conditions = [eq(metricEntries.metricId, metricId)];
  const cursorFilter = query.cursor ? metricEntryCursorCondition(query.cursor) : undefined;
  if (cursorFilter) {
    conditions.push(cursorFilter);
  }

  const rows = await db
    .select()
    .from(metricEntries)
    .where(and(...conditions))
    .orderBy(desc(metricEntries.recordedAt), desc(metricEntries.id))
    .limit(query.limit + 1);

  const mapped = rows.map((row) => ({ ...row, createdAt: row.createdAt }));
  const hasMore = mapped.length > query.limit;
  const data = hasMore ? mapped.slice(0, query.limit) : mapped;
  const last = data.at(-1);
  const nextCursor =
    hasMore && last
      ? Buffer.from(JSON.stringify({ t: last.recordedAt.getTime(), id: last.id })).toString(
          "base64url",
        )
      : null;

  return { data, nextCursor };
}

export async function getMetricEntryApi(metricId: string, entryId: string) {
  const [row] = await getDb()
    .select()
    .from(metricEntries)
    .where(and(eq(metricEntries.metricId, metricId), eq(metricEntries.id, entryId)))
    .limit(1);
  return row ?? null;
}

export async function createMetricEntryApi(
  user: AuthUser,
  metricId: string,
  input: z.infer<typeof createMetricEntrySchema>,
) {
  const recordedAt = input.recordedAt ? new Date(input.recordedAt) : undefined;
  const result = await addEntryRecord(user.id, {
    metricId,
    value: input.value,
    note: input.note,
    recordedAt,
  });
  return result?.entry ?? null;
}

export async function updateMetricEntryApi(
  metricId: string,
  entryId: string,
  input: z.infer<typeof updateMetricEntrySchema>,
) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(metricEntries)
    .where(and(eq(metricEntries.metricId, metricId), eq(metricEntries.id, entryId)))
    .limit(1);
  if (!existing) {
    return null;
  }

  const [updated] = await db
    .update(metricEntries)
    .set({
      value: input.value ?? existing.value,
      note: input.note !== undefined ? input.note : existing.note,
      recordedAt: input.recordedAt ? new Date(input.recordedAt) : existing.recordedAt,
    })
    .where(eq(metricEntries.id, entryId))
    .returning();

  return updated ?? null;
}

export async function deleteMetricEntryApi(metricId: string, entryId: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(metricEntries)
    .where(and(eq(metricEntries.metricId, metricId), eq(metricEntries.id, entryId)))
    .limit(1);
  if (!existing) {
    return false;
  }
  await db.delete(metricEntries).where(eq(metricEntries.id, entryId));
  return true;
}

export async function listEventsApi(query: PaginationQuery) {
  const db = getDb();
  const conditions = [];
  const cursorFilter = query.cursor
    ? cursorCondition(events.createdAt, events.id, query.cursor)
    : undefined;
  if (cursorFilter) {
    conditions.push(cursorFilter);
  }

  const rows = await db
    .select()
    .from(events)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(query.limit + 1);

  return paginateRows(rows, query.limit);
}

export async function getEventApi(id: string) {
  const [row] = await getDb().select().from(events).where(eq(events.id, id)).limit(1);
  return row ?? null;
}

export async function createEventApi(user: AuthUser, input: z.infer<typeof createEventSchema>) {
  const now = new Date();
  const id = crypto.randomUUID();
  const row: Event = {
    id,
    title: input.title,
    startsAt: new Date(input.startsAt),
    location: input.location ?? null,
    link: input.link ?? null,
    note: input.note ?? null,
    createdByUserId: user.id,
    updatedByUserId: user.id,
    createdAt: now,
    updatedAt: now,
  };

  await getDb().insert(events).values(row);

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "event.created",
    actorId: user.id,
    entityType: "event",
    entityId: id,
    summary: `${actor} added event "${input.title}"`,
  });
  if (input.note) {
    await emitMentions({
      body: input.note,
      entityType: "event",
      entityId: id,
      actorId: user.id,
    });
  }

  return row;
}

export async function updateEventApi(
  user: AuthUser,
  id: string,
  input: z.infer<typeof updateEventSchema>,
) {
  const db = getDb();
  const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!existing) {
    return null;
  }

  const now = new Date();
  const [updated] = await db
    .update(events)
    .set({
      title: input.title ?? existing.title,
      startsAt: input.startsAt ? new Date(input.startsAt) : existing.startsAt,
      location: input.location !== undefined ? input.location : existing.location,
      link: input.link !== undefined ? input.link : existing.link,
      note: input.note !== undefined ? input.note : existing.note,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(events.id, id))
    .returning();

  if (!updated) {
    return null;
  }

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "event.updated",
    actorId: user.id,
    entityType: "event",
    entityId: id,
    summary: `${actor} updated event "${updated.title}"`,
  });

  return updated;
}

export async function deleteEventApi(id: string) {
  const db = getDb();
  const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!existing) {
    return false;
  }
  await db.delete(events).where(eq(events.id, id));
  return true;
}

/** Test-only helper for metrics pagination cursor on recordedAt. */
export function metricEntriesRecordedAtIndex(): void {
  getDb().run(sql`
    CREATE INDEX IF NOT EXISTS metric_entries_metric_id_recorded_at_idx
    ON metric_entries (metric_id, recorded_at)
  `);
}
