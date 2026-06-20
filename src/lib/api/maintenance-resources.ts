import { and, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  maintenanceLogItemTags,
  maintenanceLogs,
  maintenanceLogTags,
  type MaintenanceLog,
  type MaintenanceLogTag,
} from "@/db/schema/maintenance";
import type { AuthUser } from "@/lib/auth/lucia";
import { displayName } from "@/lib/auth/session";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";
import { decodeCursor, paginateRows, type PaginationQuery } from "@/lib/api/pagination";
import { toIso } from "@/lib/api/serialize";
import type { createMaintenanceLogSchema, updateMaintenanceLogSchema } from "@/lib/api/schemas";
import type { z } from "zod";

export type MaintenanceListQuery = PaginationQuery & {
  q?: string;
  tag?: string;
  category?: string;
};

async function loadTagsForLogs(logIds: string[]): Promise<Map<string, MaintenanceLogTag[]>> {
  const result = new Map<string, MaintenanceLogTag[]>();
  if (logIds.length === 0) {
    return result;
  }

  const rows = await getDb()
    .select({
      logId: maintenanceLogItemTags.maintenanceLogId,
      tag: maintenanceLogTags,
    })
    .from(maintenanceLogItemTags)
    .innerJoin(maintenanceLogTags, eq(maintenanceLogItemTags.tagId, maintenanceLogTags.id))
    .where(inArray(maintenanceLogItemTags.maintenanceLogId, logIds));

  for (const row of rows) {
    const current = result.get(row.logId) ?? [];
    current.push(row.tag);
    result.set(row.logId, current);
  }

  return result;
}

async function resolveTagIdByName(name: string): Promise<string | null> {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const [existing] = await getDb()
    .select()
    .from(maintenanceLogTags)
    .where(sql`lower(${maintenanceLogTags.name}) = ${normalized}`)
    .limit(1);

  return existing?.id ?? null;
}

async function getOrCreateTagId(name: string, now: Date): Promise<string> {
  const trimmed = name.trim();
  const normalized = trimmed.toLowerCase();

  const [existing] = await getDb()
    .select()
    .from(maintenanceLogTags)
    .where(sql`lower(${maintenanceLogTags.name}) = ${normalized}`)
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const id = crypto.randomUUID();
  await getDb().insert(maintenanceLogTags).values({ id, name: trimmed, createdAt: now });
  return id;
}

async function replaceLogTags(logId: string, tagNames: string[]): Promise<void> {
  const db = getDb();
  const now = new Date();
  const uniqueNames = [...new Set(tagNames.map((name) => name.trim()).filter(Boolean))];
  const tagIds: string[] = [];

  for (const name of uniqueNames) {
    tagIds.push(await getOrCreateTagId(name, now));
  }

  await db.delete(maintenanceLogItemTags).where(eq(maintenanceLogItemTags.maintenanceLogId, logId));

  if (tagIds.length > 0) {
    await db.insert(maintenanceLogItemTags).values(
      tagIds.map((tagId) => ({
        maintenanceLogId: logId,
        tagId,
      })),
    );
  }
}

export function serializeMaintenanceLog(row: MaintenanceLog, tags: MaintenanceLogTag[] = []) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    category: row.category,
    company: row.company,
    costCents: row.costCents,
    startedAt: row.startedAt ? toIso(row.startedAt) : null,
    completedAt: row.completedAt ? toIso(row.completedAt) : null,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    tags: tags.map((tag) => tag.name),
  };
}

export async function listMaintenanceLogsApi(query: MaintenanceListQuery) {
  const db = getDb();
  const conditions: SQL[] = [];
  const decoded = query.cursor ? decodeCursor(query.cursor) : null;

  if (decoded) {
    const cursorDate = new Date(decoded.t);
    conditions.push(
      or(
        lt(maintenanceLogs.updatedAt, cursorDate),
        and(eq(maintenanceLogs.updatedAt, cursorDate), lt(maintenanceLogs.id, decoded.id)),
      )!,
    );
  }

  if (query.q) {
    const pattern = `%${query.q.toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(${maintenanceLogs.title}) like ${pattern}`,
        sql`lower(coalesce(${maintenanceLogs.notes}, '')) like ${pattern}`,
        sql`lower(coalesce(${maintenanceLogs.company}, '')) like ${pattern}`,
      )!,
    );
  }

  if (query.category) {
    conditions.push(sql`lower(${maintenanceLogs.category}) = ${query.category.toLowerCase()}`);
  }

  if (query.tag) {
    const tagId = await resolveTagIdByName(query.tag);
    if (!tagId) {
      return paginateRows([], query.limit);
    }
    const tagged = await db
      .select({ logId: maintenanceLogItemTags.maintenanceLogId })
      .from(maintenanceLogItemTags)
      .where(eq(maintenanceLogItemTags.tagId, tagId));
    const logIds = tagged.map((row) => row.logId);
    if (logIds.length === 0) {
      return paginateRows([], query.limit);
    }
    conditions.push(inArray(maintenanceLogs.id, logIds));
  }

  const rows = await db
    .select()
    .from(maintenanceLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(maintenanceLogs.updatedAt), desc(maintenanceLogs.id))
    .limit(query.limit + 1);

  const page = paginateRows(rows, query.limit);
  const tagsByLog = await loadTagsForLogs(page.data.map((row) => row.id));

  return {
    ...page,
    data: page.data.map((row) => ({
      ...row,
      tags: tagsByLog.get(row.id) ?? [],
    })),
  };
}

export async function getMaintenanceLogApi(id: string) {
  const [row] = await getDb()
    .select()
    .from(maintenanceLogs)
    .where(eq(maintenanceLogs.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  const tagsByLog = await loadTagsForLogs([row.id]);
  return { ...row, tags: tagsByLog.get(row.id) ?? [] };
}

export async function createMaintenanceLogApi(
  user: AuthUser,
  input: z.infer<typeof createMaintenanceLogSchema>,
) {
  const now = new Date();
  const id = crypto.randomUUID();

  await getDb()
    .insert(maintenanceLogs)
    .values({
      id,
      title: input.title,
      notes: input.notes ?? null,
      category: input.category ?? null,
      company: input.company ?? null,
      costCents: input.costCents ?? null,
      startedAt: input.startedAt ? new Date(input.startedAt) : null,
      completedAt: input.completedAt ? new Date(input.completedAt) : null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

  if (input.tags?.length) {
    await replaceLogTags(id, input.tags);
  }

  if (input.notes) {
    await emitMentions({
      body: input.notes,
      entityType: "maintenance_log",
      entityId: id,
      actorId: user.id,
    });
  }

  await emitHouseholdActivity({
    type: "maintenance.created",
    actorId: user.id,
    entityType: "maintenance_log",
    entityId: id,
    summary: `${displayName(user)} logged maintenance: ${input.title}`,
  });

  return getMaintenanceLogApi(id);
}

export async function updateMaintenanceLogApi(
  user: AuthUser,
  id: string,
  input: z.infer<typeof updateMaintenanceLogSchema>,
) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(maintenanceLogs)
    .where(eq(maintenanceLogs.id, id))
    .limit(1);
  if (!existing) {
    return null;
  }

  const now = new Date();
  const patch: Partial<typeof maintenanceLogs.$inferInsert> = {
    updatedByUserId: user.id,
    updatedAt: now,
  };

  if (input.title !== undefined) patch.title = input.title;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.category !== undefined) patch.category = input.category;
  if (input.company !== undefined) patch.company = input.company;
  if (input.costCents !== undefined) patch.costCents = input.costCents;
  if (input.startedAt !== undefined) {
    patch.startedAt = input.startedAt ? new Date(input.startedAt) : null;
  }
  if (input.completedAt !== undefined) {
    patch.completedAt = input.completedAt ? new Date(input.completedAt) : null;
  }

  await db.update(maintenanceLogs).set(patch).where(eq(maintenanceLogs.id, id));

  if (input.tags) {
    await replaceLogTags(id, input.tags);
  }

  if (input.notes !== undefined) {
    await emitMentions({
      body: input.notes ?? "",
      entityType: "maintenance_log",
      entityId: id,
      actorId: user.id,
    });
  }

  await emitHouseholdActivity({
    type: "maintenance.updated",
    actorId: user.id,
    entityType: "maintenance_log",
    entityId: id,
    summary: `${displayName(user)} updated maintenance: ${patch.title ?? existing.title}`,
  });

  return getMaintenanceLogApi(id);
}

export async function deleteMaintenanceLogApi(id: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(maintenanceLogs)
    .where(eq(maintenanceLogs.id, id))
    .limit(1);
  if (!existing) {
    return false;
  }
  await db.delete(maintenanceLogs).where(eq(maintenanceLogs.id, id));
  return true;
}

export async function listMaintenanceCategoriesApi(): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ category: maintenanceLogs.category })
    .from(maintenanceLogs)
    .where(sql`${maintenanceLogs.category} IS NOT NULL AND ${maintenanceLogs.category} != ''`)
    .orderBy(maintenanceLogs.category);

  return rows.map((row) => row.category).filter((value): value is string => Boolean(value?.trim()));
}
