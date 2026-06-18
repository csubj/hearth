import { and, desc, eq, lt, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  metricEntries,
  metrics,
  projectComponents,
  projects,
  restaurants,
  type Metric,
  type MetricEntry,
  type Project,
  type ProjectComponent,
  type Restaurant,
} from "@/db/schema";
import type { AuthUser } from "@/lib/auth/lucia";
import { componentRollups } from "@/lib/projects/rollups";
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
  createMetricEntrySchema,
  createMetricSchema,
  createProjectSchema,
  createProjectComponentSchema,
  createRestaurantSchema,
  updateMetricEntrySchema,
  updateMetricSchema,
  updateProjectSchema,
  updateProjectComponentSchema,
  updateRestaurantSchema,
} from "@/lib/api/schemas";
import type { z } from "zod";

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
    notes: row.notes,
    status: row.status,
    priority: row.priority,
    targetWhen: row.targetWhen,
    budgetCents: row.budgetCents,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

export function serializeProjectDetail(
  row: Project,
  rollups: {
    estimatedCostCents: number;
    acquiredCostCents: number;
    remainingCostCents: number;
    acquiredCount: number;
    componentCount: number;
  },
) {
  return {
    ...serializeProject(row),
    ...rollups,
  };
}

export function serializeProjectComponent(row: ProjectComponent) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    kind: row.kind,
    quantity: row.quantity,
    unitCostCents: row.unitCostCents,
    acquired: row.acquired,
    acquiredAt: toIso(row.acquiredAt),
    purchaseUrl: row.purchaseUrl,
    sortOrder: row.sortOrder,
    note: row.note,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

export function serializeMetric(row: Metric) {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    reminderIntervalCount: row.reminderIntervalCount,
    reminderIntervalUnit: row.reminderIntervalUnit,
    lastReminderAt: toIso(row.lastReminderAt),
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

export async function getProjectWithRollupsApi(id: string) {
  const project = await getProjectApi(id);
  if (!project) {
    return null;
  }

  const components = await getDb()
    .select()
    .from(projectComponents)
    .where(eq(projectComponents.projectId, id))
    .orderBy(projectComponents.sortOrder, projectComponents.createdAt);

  return {
    project,
    components,
    rollups: componentRollups(components),
  };
}

export async function listProjectComponentsApi(projectId: string, query: PaginationQuery) {
  const db = getDb();
  const conditions = [eq(projectComponents.projectId, projectId)];
  const cursorFilter = query.cursor
    ? cursorCondition(projectComponents.createdAt, projectComponents.id, query.cursor)
    : undefined;
  if (cursorFilter) {
    conditions.push(cursorFilter);
  }

  const rows = await db
    .select()
    .from(projectComponents)
    .where(and(...conditions))
    .orderBy(projectComponents.sortOrder, projectComponents.createdAt, projectComponents.id)
    .limit(query.limit + 1);

  return paginateRows(rows, query.limit);
}

export async function getProjectComponentApi(projectId: string, componentId: string) {
  const [row] = await getDb()
    .select()
    .from(projectComponents)
    .where(and(eq(projectComponents.projectId, projectId), eq(projectComponents.id, componentId)))
    .limit(1);
  return row ?? null;
}

export async function createProjectComponentApi(
  user: AuthUser,
  projectId: string,
  input: z.infer<typeof createProjectComponentSchema>,
) {
  const project = await getProjectApi(projectId);
  if (!project) {
    return null;
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(projectComponents)
    .where(eq(projectComponents.projectId, projectId))
    .orderBy(projectComponents.sortOrder);

  const now = new Date();
  const maxSort = existing.length > 0 ? Math.max(...existing.map((row) => row.sortOrder)) : -1;
  const acquired = input.acquired ?? false;
  const id = crypto.randomUUID();

  const [row] = await db
    .insert(projectComponents)
    .values({
      id,
      projectId,
      name: input.name,
      kind: input.kind ?? "item",
      quantity: input.quantity ?? 1,
      unitCostCents: input.unitCostCents ?? 0,
      acquired,
      acquiredAt: acquired ? now : null,
      purchaseUrl: input.purchaseUrl ?? null,
      sortOrder: maxSort + 1,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db
    .update(projects)
    .set({ updatedByUserId: user.id, updatedAt: now })
    .where(eq(projects.id, projectId));

  return row ?? null;
}

export async function updateProjectComponentApi(
  user: AuthUser,
  projectId: string,
  componentId: string,
  input: z.infer<typeof updateProjectComponentSchema>,
) {
  const db = getDb();
  const existing = await getProjectComponentApi(projectId, componentId);
  if (!existing) {
    return null;
  }

  const now = new Date();
  const acquired =
    input.acquired !== undefined ? input.acquired : existing.acquired;
  const acquiredAt =
    input.acquired === undefined
      ? existing.acquiredAt
      : input.acquired
        ? now
        : null;

  const [updated] = await db
    .update(projectComponents)
    .set({
      name: input.name ?? existing.name,
      kind: input.kind ?? existing.kind,
      quantity: input.quantity ?? existing.quantity,
      unitCostCents: input.unitCostCents ?? existing.unitCostCents,
      acquired,
      acquiredAt,
      purchaseUrl: input.purchaseUrl !== undefined ? input.purchaseUrl : existing.purchaseUrl,
      note: input.note !== undefined ? input.note : existing.note,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      updatedAt: now,
    })
    .where(eq(projectComponents.id, componentId))
    .returning();

  await db
    .update(projects)
    .set({ updatedByUserId: user.id, updatedAt: now })
    .where(eq(projects.id, projectId));

  return updated ?? null;
}

export async function deleteProjectComponentApi(projectId: string, componentId: string) {
  const db = getDb();
  const existing = await getProjectComponentApi(projectId, componentId);
  if (!existing) {
    return false;
  }

  await db
    .delete(projectComponents)
    .where(and(eq(projectComponents.projectId, projectId), eq(projectComponents.id, componentId)));
  return true;
}

export async function createProjectApi(user: AuthUser, input: z.infer<typeof createProjectSchema>) {
  const now = new Date();
  const id = crypto.randomUUID();
  const row: Project = {
    id,
    title: input.title,
    notes: input.notes ?? null,
    status: input.status ?? "idea",
    priority: input.priority ?? null,
    targetWhen: input.targetWhen ?? null,
    budgetCents: input.budgetCents ?? null,
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
  if (input.notes) {
    await emitMentions({
      body: input.notes,
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
      notes: input.notes !== undefined ? input.notes : existing.notes,
      status: input.status ?? existing.status,
      priority: input.priority !== undefined ? input.priority : existing.priority,
      targetWhen: input.targetWhen !== undefined ? input.targetWhen : existing.targetWhen,
      budgetCents: input.budgetCents !== undefined ? input.budgetCents : existing.budgetCents,
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
    remindersEnabled:
      input.reminderIntervalCount !== undefined || input.reminderIntervalUnit !== undefined
        ? input.reminderIntervalCount != null && input.reminderIntervalUnit != null
        : undefined,
    reminderIntervalCount:
      input.reminderIntervalCount !== undefined
        ? input.reminderIntervalCount
        : existing.reminderIntervalCount,
    reminderIntervalUnit:
      input.reminderIntervalUnit !== undefined
        ? input.reminderIntervalUnit
        : existing.reminderIntervalUnit,
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

/** Test-only helper for metrics pagination cursor on recordedAt. */
export function metricEntriesRecordedAtIndex(): void {
  getDb().run(sql`
    CREATE INDEX IF NOT EXISTS metric_entries_metric_id_recorded_at_idx
    ON metric_entries (metric_id, recorded_at)
  `);
}
