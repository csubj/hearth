"use server";

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import {
  inventoryItems,
  maintenanceLogInventoryItems,
  maintenanceLogItemTags,
  maintenanceLogLinks,
  maintenanceLogProjects,
  maintenanceLogReminders,
  maintenanceLogs,
  maintenanceLogTags,
  projects,
  type MaintenanceLog,
  type MaintenanceLogLink,
  type MaintenanceLogTag,
} from "@/db/schema";
import { displayName, requireUser } from "@/lib/auth/session";
import {
  loadMaintenanceLogRemindersForLog,
  type MaintenanceLogReminderWithMeta,
} from "@/lib/actions/maintenance-log-reminders";
import { isMaintenanceLogReminderStale } from "@/lib/maintenance/reminder-interval";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";

const MAINTENANCE_ENTITY_TYPE = "maintenance_log" as const;

export type MaintenanceActionState = {
  error?: string;
  success?: string;
};

export type MaintenanceListItem = MaintenanceLog & {
  tags: MaintenanceLogTag[];
  hasOverdueReminder: boolean;
};

export type MaintenanceRelatedProject = {
  id: string;
  title: string;
};

export type MaintenanceRelatedInventoryItem = {
  id: string;
  name: string;
};

export type MaintenanceDetail = MaintenanceLog & {
  tags: MaintenanceLogTag[];
  links: MaintenanceLogLink[];
  reminders: MaintenanceLogReminderWithMeta[];
  relatedProjects: MaintenanceRelatedProject[];
  relatedInventoryItems: MaintenanceRelatedInventoryItem[];
};

export type MaintenanceListFilters = {
  q?: string;
  tag?: string;
  category?: string;
  sort?: "updated_desc" | "started_desc" | "cost_desc" | "completed_desc";
};

const titleSchema = z.string().trim().min(1, "Title is required").max(200);
const notesSchema = z.string().trim().max(10_000).optional();
const optionalText = (max: number) => z.string().trim().max(max).optional();
const urlSchema = z.string().trim().url("Valid URL is required").max(2000);

function searchPattern(query: string): string {
  return `%${query.toLowerCase()}%`;
}

function revalidateMaintenancePaths(logId?: string): void {
  revalidatePath("/maintenance");
  revalidatePath("/");
  revalidatePath("/browse");
  revalidatePath("/reminders");
  if (logId) {
    revalidatePath(`/maintenance/${logId}`);
  }
}

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

function parseListFilters(
  searchParams: Record<string, string | string[] | undefined>,
): MaintenanceListFilters {
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : undefined;
  const tag = typeof searchParams.tag === "string" ? searchParams.tag.trim() : undefined;
  const category =
    typeof searchParams.category === "string" ? searchParams.category.trim() : undefined;
  const sortRaw = typeof searchParams.sort === "string" ? searchParams.sort.trim() : undefined;
  const sort =
    sortRaw === "started_desc" ||
    sortRaw === "cost_desc" ||
    sortRaw === "completed_desc" ||
    sortRaw === "updated_desc"
      ? sortRaw
      : "updated_desc";

  return {
    q: q || undefined,
    tag: tag || undefined,
    category: category || undefined,
    sort,
  };
}

function sortLogs(
  items: MaintenanceListItem[],
  sort: MaintenanceListFilters["sort"],
): MaintenanceListItem[] {
  const copy = [...items];
  switch (sort) {
    case "started_desc":
      return copy.sort((a, b) => {
        const aTime = a.startedAt?.getTime() ?? 0;
        const bTime = b.startedAt?.getTime() ?? 0;
        if (bTime !== aTime) {
          return bTime - aTime;
        }
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
    case "cost_desc":
      return copy.sort((a, b) => {
        const aCost = a.costCents ?? 0;
        const bCost = b.costCents ?? 0;
        if (bCost !== aCost) {
          return bCost - aCost;
        }
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
    case "completed_desc":
      return copy.sort((a, b) => {
        const aTime = a.completedAt?.getTime() ?? 0;
        const bTime = b.completedAt?.getTime() ?? 0;
        if (bTime !== aTime) {
          return bTime - aTime;
        }
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
    case "updated_desc":
    default:
      return copy.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}

async function loadOverdueReminderLogIds(viewerUserId: string): Promise<Set<string>> {
  const rows = await getDb().select().from(maintenanceLogReminders);
  const overdue = new Set<string>();
  const now = new Date();
  for (const reminder of rows) {
    if (isMaintenanceLogReminderStale(reminder, now, viewerUserId)) {
      overdue.add(reminder.maintenanceLogId);
    }
  }
  return overdue;
}

export async function listMaintenanceTags(): Promise<MaintenanceLogTag[]> {
  await requireUser();
  return getDb().select().from(maintenanceLogTags).orderBy(maintenanceLogTags.name);
}

export async function listMaintenanceCategories(): Promise<string[]> {
  await requireUser();
  const rows = await getDb()
    .selectDistinct({ category: maintenanceLogs.category })
    .from(maintenanceLogs)
    .where(sql`${maintenanceLogs.category} IS NOT NULL AND ${maintenanceLogs.category} != ''`)
    .orderBy(maintenanceLogs.category);

  return rows.map((row) => row.category).filter((value): value is string => Boolean(value?.trim()));
}

export async function listMaintenanceLogs(
  searchParams: Record<string, string | string[] | undefined> = {},
): Promise<MaintenanceListItem[]> {
  const { user } = await requireUser();
  const { q, tag, category, sort = "updated_desc" } = parseListFilters(searchParams);
  const db = getDb();

  const conditions = [];

  if (q) {
    const pattern = searchPattern(q);
    conditions.push(
      or(
        sql`lower(${maintenanceLogs.title}) like ${pattern}`,
        sql`lower(coalesce(${maintenanceLogs.notes}, '')) like ${pattern}`,
        sql`lower(coalesce(${maintenanceLogs.company}, '')) like ${pattern}`,
        sql`lower(coalesce(${maintenanceLogs.category}, '')) like ${pattern}`,
      ),
    );
  }

  if (category) {
    conditions.push(sql`lower(${maintenanceLogs.category}) = ${category.toLowerCase()}`);
  }

  if (tag) {
    const tagId = await resolveTagIdByName(tag);
    if (!tagId) {
      return [];
    }
    const tagged = await db
      .select({ logId: maintenanceLogItemTags.maintenanceLogId })
      .from(maintenanceLogItemTags)
      .where(eq(maintenanceLogItemTags.tagId, tagId));
    const logIdsFromTag = tagged.map((row) => row.logId);
    if (logIdsFromTag.length === 0) {
      return [];
    }
    conditions.push(inArray(maintenanceLogs.id, logIdsFromTag));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(maintenanceLogs).where(whereClause);

  const logIds = rows.map((row) => row.id);
  const [tagsByLog, overdueLogIds] = await Promise.all([
    loadTagsForLogs(logIds),
    loadOverdueReminderLogIds(user.id),
  ]);

  let items: MaintenanceListItem[] = rows.map((row) => ({
    ...row,
    tags: tagsByLog.get(row.id) ?? [],
    hasOverdueReminder: overdueLogIds.has(row.id),
  }));

  if (q) {
    const pattern = q.toLowerCase();
    items = items.filter((item) => {
      if (
        item.title.toLowerCase().includes(pattern) ||
        (item.notes?.toLowerCase().includes(pattern) ?? false) ||
        (item.company?.toLowerCase().includes(pattern) ?? false) ||
        (item.category?.toLowerCase().includes(pattern) ?? false)
      ) {
        return true;
      }
      return item.tags.some((tagItem) => tagItem.name.toLowerCase().includes(pattern));
    });
  }

  return sortLogs(items, sort);
}

export async function getMaintenanceLogById(id: string): Promise<MaintenanceDetail | null> {
  const { user } = await requireUser();
  const db = getDb();

  const [log] = await db.select().from(maintenanceLogs).where(eq(maintenanceLogs.id, id)).limit(1);
  if (!log) {
    return null;
  }

  const [tags, links, relatedProjects, relatedInventoryItems, reminders] = await Promise.all([
    db
      .select({ tag: maintenanceLogTags })
      .from(maintenanceLogItemTags)
      .innerJoin(maintenanceLogTags, eq(maintenanceLogItemTags.tagId, maintenanceLogTags.id))
      .where(eq(maintenanceLogItemTags.maintenanceLogId, id))
      .then((rows) => rows.map((row) => row.tag)),
    db
      .select()
      .from(maintenanceLogLinks)
      .where(eq(maintenanceLogLinks.maintenanceLogId, id))
      .orderBy(maintenanceLogLinks.createdAt),
    db
      .select({ id: projects.id, title: projects.title })
      .from(maintenanceLogProjects)
      .innerJoin(projects, eq(maintenanceLogProjects.projectId, projects.id))
      .where(eq(maintenanceLogProjects.maintenanceLogId, id)),
    db
      .select({ id: inventoryItems.id, name: inventoryItems.name })
      .from(maintenanceLogInventoryItems)
      .innerJoin(
        inventoryItems,
        eq(maintenanceLogInventoryItems.inventoryItemId, inventoryItems.id),
      )
      .where(eq(maintenanceLogInventoryItems.maintenanceLogId, id)),
    loadMaintenanceLogRemindersForLog(id, user.id),
  ]);

  return {
    ...log,
    tags,
    links,
    reminders,
    relatedProjects,
    relatedInventoryItems,
  };
}

export async function getMaintenanceHomeSummary(limit = 5): Promise<MaintenanceListItem[]> {
  const items = await listMaintenanceLogs({});
  return items
    .sort((a, b) => {
      if (a.hasOverdueReminder !== b.hasOverdueReminder) {
        return a.hasOverdueReminder ? -1 : 1;
      }
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .slice(0, limit);
}

export async function getMaintenanceHomeStats(): Promise<{
  total: number;
  dueReminders: number;
}> {
  const { user } = await requireUser();
  const db = getDb();

  const [totalRow] = await db.select({ count: sql<number>`count(*)` }).from(maintenanceLogs);

  const overdueLogIds = await loadOverdueReminderLogIds(user.id);

  return {
    total: totalRow?.count ?? 0,
    dueReminders: overdueLogIds.size,
  };
}

export async function createMaintenanceLog(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const { user } = await requireUser();
  const parsed = z
    .object({
      title: titleSchema,
      notes: notesSchema,
      category: optionalText(100),
      company: optionalText(200),
      costCents: z.coerce.number().int().min(0).optional().nullable(),
      startedAt: z.coerce.date().optional().nullable(),
      completedAt: z.coerce.date().optional().nullable(),
      tags: optionalText(500),
    })
    .safeParse({
      title: formData.get("title"),
      notes: formData.get("notes") || undefined,
      category: formData.get("category") || undefined,
      company: formData.get("company") || undefined,
      costCents: formData.get("costCents") || undefined,
      startedAt: formData.get("startedAt") || undefined,
      completedAt: formData.get("completedAt") || undefined,
      tags: formData.get("tags") || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const data = parsed.data;

  await getDb()
    .insert(maintenanceLogs)
    .values({
      id,
      title: data.title,
      notes: data.notes ?? null,
      category: data.category ?? null,
      company: data.company ?? null,
      costCents: data.costCents ?? null,
      startedAt: data.startedAt ?? null,
      completedAt: data.completedAt ?? null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

  if (data.tags) {
    const tagNames = data.tags
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    await replaceLogTags(id, tagNames);
  }

  if (data.notes) {
    await emitMentions({
      body: data.notes,
      entityType: MAINTENANCE_ENTITY_TYPE,
      entityId: id,
      actorId: user.id,
    });
  }

  await emitHouseholdActivity({
    type: "maintenance.created",
    actorId: user.id,
    entityType: MAINTENANCE_ENTITY_TYPE,
    entityId: id,
    summary: `${displayName(user)} logged maintenance: ${data.title}`,
  });

  revalidateMaintenancePaths();
  redirect(`/maintenance/${id}`);
}

export async function updateMaintenanceLog(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const { user } = await requireUser();
  const parsed = z
    .object({
      id: z.string().uuid(),
      title: titleSchema.optional(),
      notes: notesSchema,
      category: optionalText(100).nullable(),
      company: optionalText(200).nullable(),
      costCents: z
        .union([z.coerce.number(), z.literal(""), z.null()])
        .optional()
        .transform((val) => {
          if (val === "" || val == null) return null;
          const num = Number(val);
          if (Number.isNaN(num)) return null;
          return Math.round(num * 100);
        }),
      startedAt: z.coerce.date().optional().nullable(),
      completedAt: z.coerce.date().optional().nullable(),
    })
    .safeParse({
      id: formData.get("id"),
      title: formData.get("title") || undefined,
      notes: formData.has("notes") ? formData.get("notes") || "" : undefined,
      category: formData.has("category") ? formData.get("category") || null : undefined,
      company: formData.has("company") ? formData.get("company") || null : undefined,
      costCents: formData.has("costCents") ? formData.get("costCents") || null : undefined,
      startedAt: formData.has("startedAt") ? formData.get("startedAt") || null : undefined,
      completedAt: formData.has("completedAt") ? formData.get("completedAt") || null : undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { id, ...updates } = parsed.data;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(maintenanceLogs)
    .where(eq(maintenanceLogs.id, id))
    .limit(1);
  if (!existing) {
    return { error: "Maintenance log not found" };
  }

  const now = new Date();
  const patch: Partial<typeof maintenanceLogs.$inferInsert> = {
    updatedByUserId: user.id,
    updatedAt: now,
  };

  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.notes !== undefined) patch.notes = updates.notes || null;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.company !== undefined) patch.company = updates.company;
  if (updates.costCents !== undefined) patch.costCents = updates.costCents;
  if (updates.startedAt !== undefined) patch.startedAt = updates.startedAt;
  if (updates.completedAt !== undefined) patch.completedAt = updates.completedAt;

  await db.update(maintenanceLogs).set(patch).where(eq(maintenanceLogs.id, id));

  if (updates.notes !== undefined) {
    await emitMentions({
      body: updates.notes ?? "",
      entityType: MAINTENANCE_ENTITY_TYPE,
      entityId: id,
      actorId: user.id,
    });
  }

  await emitHouseholdActivity({
    type: "maintenance.updated",
    actorId: user.id,
    entityType: MAINTENANCE_ENTITY_TYPE,
    entityId: id,
    summary: `${displayName(user)} updated maintenance: ${patch.title ?? existing.title}`,
  });

  revalidateMaintenancePaths(id);
  return { success: "Saved" };
}

export async function deleteMaintenanceLog(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const { user } = await requireUser();
  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });

  if (!parsed.success) {
    return { error: "Invalid maintenance log" };
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(maintenanceLogs)
    .where(eq(maintenanceLogs.id, parsed.data.id))
    .limit(1);
  if (!existing) {
    return { error: "Maintenance log not found" };
  }

  await db.delete(maintenanceLogs).where(eq(maintenanceLogs.id, parsed.data.id));

  await emitHouseholdActivity({
    type: "maintenance.deleted",
    actorId: user.id,
    entityType: MAINTENANCE_ENTITY_TYPE,
    entityId: parsed.data.id,
    summary: `${displayName(user)} deleted maintenance log: ${existing.title}`,
  });

  revalidateMaintenancePaths();
  redirect("/maintenance");
}

export async function setMaintenanceTags(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  await requireUser();
  const parsed = z
    .object({
      id: z.string().uuid(),
      tags: z.string().trim().max(500),
    })
    .safeParse({
      id: formData.get("id"),
      tags: formData.get("tags") ?? "",
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [existing] = await getDb()
    .select({ id: maintenanceLogs.id })
    .from(maintenanceLogs)
    .where(eq(maintenanceLogs.id, parsed.data.id))
    .limit(1);
  if (!existing) {
    return { error: "Maintenance log not found" };
  }

  const tagNames = parsed.data.tags
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  await replaceLogTags(parsed.data.id, tagNames);
  revalidateMaintenancePaths(parsed.data.id);
  return { success: "Tags updated" };
}

export async function addMaintenanceLink(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  await requireUser();
  const parsed = z
    .object({
      maintenanceLogId: z.string().uuid(),
      label: z.string().trim().min(1).max(200),
      url: urlSchema,
    })
    .safeParse({
      maintenanceLogId: formData.get("maintenanceLogId"),
      label: formData.get("label"),
      url: formData.get("url"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await getDb().insert(maintenanceLogLinks).values({
    id: crypto.randomUUID(),
    maintenanceLogId: parsed.data.maintenanceLogId,
    label: parsed.data.label,
    url: parsed.data.url,
    createdAt: new Date(),
  });

  revalidateMaintenancePaths(parsed.data.maintenanceLogId);
  return { success: "Link added" };
}

export async function removeMaintenanceLink(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  await requireUser();
  const parsed = z
    .object({
      linkId: z.string().uuid(),
      maintenanceLogId: z.string().uuid(),
    })
    .safeParse({
      linkId: formData.get("linkId"),
      maintenanceLogId: formData.get("maintenanceLogId"),
    });

  if (!parsed.success) {
    return { error: "Invalid link" };
  }

  await getDb().delete(maintenanceLogLinks).where(eq(maintenanceLogLinks.id, parsed.data.linkId));
  revalidateMaintenancePaths(parsed.data.maintenanceLogId);
  return { success: "Link removed" };
}

export async function linkMaintenanceProject(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  await requireUser();
  const parsed = z
    .object({
      maintenanceLogId: z.string().uuid(),
      projectId: z.string().uuid(),
    })
    .safeParse({
      maintenanceLogId: formData.get("maintenanceLogId"),
      projectId: formData.get("projectId"),
    });

  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, parsed.data.projectId))
    .limit(1);
  if (!project) {
    return { error: "Project not found" };
  }

  await db
    .insert(maintenanceLogProjects)
    .values({
      maintenanceLogId: parsed.data.maintenanceLogId,
      projectId: parsed.data.projectId,
    })
    .onConflictDoNothing();

  revalidateMaintenancePaths(parsed.data.maintenanceLogId);
  return { success: "Project linked" };
}

export async function unlinkMaintenanceProject(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  await requireUser();
  const parsed = z
    .object({
      maintenanceLogId: z.string().uuid(),
      projectId: z.string().uuid(),
    })
    .safeParse({
      maintenanceLogId: formData.get("maintenanceLogId"),
      projectId: formData.get("projectId"),
    });

  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  await getDb()
    .delete(maintenanceLogProjects)
    .where(
      and(
        eq(maintenanceLogProjects.maintenanceLogId, parsed.data.maintenanceLogId),
        eq(maintenanceLogProjects.projectId, parsed.data.projectId),
      ),
    );

  revalidateMaintenancePaths(parsed.data.maintenanceLogId);
  return { success: "Project unlinked" };
}

export async function linkMaintenanceInventoryItem(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  await requireUser();
  const parsed = z
    .object({
      maintenanceLogId: z.string().uuid(),
      inventoryItemId: z.string().uuid(),
    })
    .safeParse({
      maintenanceLogId: formData.get("maintenanceLogId"),
      inventoryItemId: formData.get("inventoryItemId"),
    });

  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const db = getDb();
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, parsed.data.inventoryItemId))
    .limit(1);
  if (!item) {
    return { error: "Inventory item not found" };
  }

  await db
    .insert(maintenanceLogInventoryItems)
    .values({
      maintenanceLogId: parsed.data.maintenanceLogId,
      inventoryItemId: parsed.data.inventoryItemId,
    })
    .onConflictDoNothing();

  revalidateMaintenancePaths(parsed.data.maintenanceLogId);
  return { success: "Inventory item linked" };
}

export async function unlinkMaintenanceInventoryItem(
  _prev: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  await requireUser();
  const parsed = z
    .object({
      maintenanceLogId: z.string().uuid(),
      inventoryItemId: z.string().uuid(),
    })
    .safeParse({
      maintenanceLogId: formData.get("maintenanceLogId"),
      inventoryItemId: formData.get("inventoryItemId"),
    });

  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  await getDb()
    .delete(maintenanceLogInventoryItems)
    .where(
      and(
        eq(maintenanceLogInventoryItems.maintenanceLogId, parsed.data.maintenanceLogId),
        eq(maintenanceLogInventoryItems.inventoryItemId, parsed.data.inventoryItemId),
      ),
    );

  revalidateMaintenancePaths(parsed.data.maintenanceLogId);
  return { success: "Inventory item unlinked" };
}

export async function updateMaintenanceNotes(
  logId: string,
  notes: string,
  options?: { reconcileMentions?: boolean },
): Promise<{ error?: string }> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      logId: z.string().uuid(),
      notes: z.string().max(10_000),
    })
    .safeParse({ logId, notes });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(maintenanceLogs)
    .where(eq(maintenanceLogs.id, logId))
    .limit(1);

  if (!existing) {
    return { error: "Maintenance log not found" };
  }

  const now = new Date();
  await db
    .update(maintenanceLogs)
    .set({
      notes: notes.trim() ? notes : null,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(maintenanceLogs.id, logId));

  if (options?.reconcileMentions !== false) {
    await emitMentions({
      body: notes,
      entityType: MAINTENANCE_ENTITY_TYPE,
      entityId: logId,
      actorId: user.id,
    });
  }

  revalidateMaintenancePaths(logId);
  return {};
}

export async function searchProjectsForLink(query: string): Promise<MaintenanceRelatedProject[]> {
  await requireUser();
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const pattern = searchPattern(trimmed);
  return getDb()
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(sql`lower(${projects.title}) like ${pattern}`)
    .orderBy(desc(projects.updatedAt))
    .limit(10);
}

export async function searchInventoryForLink(
  query: string,
): Promise<MaintenanceRelatedInventoryItem[]> {
  await requireUser();
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const pattern = searchPattern(trimmed);
  return getDb()
    .select({ id: inventoryItems.id, name: inventoryItems.name })
    .from(inventoryItems)
    .where(
      or(
        sql`lower(${inventoryItems.name}) like ${pattern}`,
        sql`lower(coalesce(${inventoryItems.brand}, '')) like ${pattern}`,
        sql`lower(coalesce(${inventoryItems.model}, '')) like ${pattern}`,
      ),
    )
    .orderBy(desc(inventoryItems.updatedAt))
    .limit(10);
}
