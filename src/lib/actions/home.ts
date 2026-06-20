"use server";

import { and, desc, eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import {
  homeItems,
  homeLinks,
  homeSpaces,
  inventoryItems,
  maintenanceLogs,
  projects,
  type HomeItem,
  type HomeItemKind,
  type HomeLink,
  type HomeLinkSourceType,
  type HomeLinkTargetType,
  type HomeSpace,
  type HomeSpaceKind,
} from "@/db/schema";
import { displayName, requireUser } from "@/lib/auth/session";
import { normalizeColorHex } from "@/lib/home/item-presets";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";

const HOME_SPACE_ENTITY_TYPE = "home_space" as const;
const HOME_ITEM_ENTITY_TYPE = "home_item" as const;

export type HomeActionState = {
  error?: string;
  success?: string;
};

export type HomeBreadcrumb = Pick<HomeSpace, "id" | "name" | "kind">;

export type HomeSpaceWithChildren = HomeSpace & {
  children: HomeSpaceSummary[];
  items: HomeItem[];
  links: HomeResolvedLink[];
  breadcrumb: HomeBreadcrumb[];
};

export type HomeItemDetail = HomeItem & {
  space: HomeSpaceSummary;
  links: HomeResolvedLink[];
};

export type HomeSpaceSummary = Pick<HomeSpace, "id" | "name" | "kind" | "sortOrder">;

export type HomeReferenceTarget = {
  sourceType: HomeLinkSourceType;
  sourceId: string;
  sourceName: string;
  sourceKind: HomeSpaceKind | HomeItemKind;
  spaceId: string | null;
};

export type HomeRelatedTarget =
  | { targetType: "maintenance_log"; id: string; title: string }
  | { targetType: "inventory_item"; id: string; name: string }
  | { targetType: "project"; id: string; title: string };

export type HomeResolvedLink = {
  id: string;
  sourceType: HomeLinkSourceType;
  sourceId: string;
  targetType: HomeLinkTargetType;
  targetId: string;
  targetName: string;
  createdAt: Date;
};

const nameSchema = z.string().trim().min(1, "Name is required").max(200);
const notesSchema = z.string().trim().max(10_000).optional();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);
const urlSchema = z
  .string()
  .trim()
  .url("Valid URL is required")
  .max(2000)
  .or(z.literal("").transform(() => undefined))
  .optional();

function searchPattern(query: string): string {
  return `%${query.toLowerCase()}%`;
}

function revalidateHomePaths(spaceId?: string, itemId?: string): void {
  revalidatePath("/home-log");
  revalidatePath("/");
  revalidatePath("/browse");
  if (spaceId) {
    revalidatePath(`/home-log/${spaceId}`);
  }
  if (itemId) {
    revalidatePath(`/home-log/items/${itemId}`);
  }
}

// ---------------------------------------------------------------------------
// Read functions
// ---------------------------------------------------------------------------

export async function getHomeRoots(): Promise<HomeSpace[]> {
  await requireUser();
  return getDb()
    .select()
    .from(homeSpaces)
    .where(sql`${homeSpaces.parentId} IS NULL`)
    .orderBy(homeSpaces.sortOrder, homeSpaces.name);
}

async function walkBreadcrumb(spaceId: string): Promise<HomeBreadcrumb[]> {
  const db = getDb();
  const crumbs: HomeBreadcrumb[] = [];
  let currentId: string | null = spaceId;

  while (currentId) {
    const [space] = await db
      .select({
        id: homeSpaces.id,
        name: homeSpaces.name,
        kind: homeSpaces.kind,
        parentId: homeSpaces.parentId,
      })
      .from(homeSpaces)
      .where(eq(homeSpaces.id, currentId))
      .limit(1);

    if (!space) break;
    crumbs.unshift({ id: space.id, name: space.name, kind: space.kind });
    currentId = space.parentId ?? null;
  }

  return crumbs;
}

async function resolveLinks(rawLinks: HomeLink[]): Promise<HomeResolvedLink[]> {
  if (rawLinks.length === 0) return [];
  const db = getDb();

  const maintenanceIds = rawLinks
    .filter((l) => l.targetType === "maintenance_log")
    .map((l) => l.targetId);
  const inventoryIds = rawLinks
    .filter((l) => l.targetType === "inventory_item")
    .map((l) => l.targetId);
  const projectIds = rawLinks.filter((l) => l.targetType === "project").map((l) => l.targetId);

  const [maintenanceRows, inventoryRows, projectRows] = await Promise.all([
    maintenanceIds.length > 0
      ? db
          .select({ id: maintenanceLogs.id, title: maintenanceLogs.title })
          .from(maintenanceLogs)
          .where(
            sql`${maintenanceLogs.id} IN (${sql.join(
              maintenanceIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
      : Promise.resolve([]),
    inventoryIds.length > 0
      ? db
          .select({ id: inventoryItems.id, name: inventoryItems.name })
          .from(inventoryItems)
          .where(
            sql`${inventoryItems.id} IN (${sql.join(
              inventoryIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
      : Promise.resolve([]),
    projectIds.length > 0
      ? db
          .select({ id: projects.id, title: projects.title })
          .from(projects)
          .where(
            sql`${projects.id} IN (${sql.join(
              projectIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
      : Promise.resolve([]),
  ]);

  const nameMap = new Map<string, string>();
  for (const row of maintenanceRows) nameMap.set(row.id, row.title);
  for (const row of inventoryRows) nameMap.set(row.id, row.name);
  for (const row of projectRows) nameMap.set(row.id, row.title);

  return rawLinks
    .filter((l) => nameMap.has(l.targetId))
    .map((l) => ({
      ...l,
      targetName: nameMap.get(l.targetId)!,
    }));
}

export async function getHomeSpaceById(id: string): Promise<HomeSpaceWithChildren | null> {
  await requireUser();
  const db = getDb();

  const [space] = await db.select().from(homeSpaces).where(eq(homeSpaces.id, id)).limit(1);
  if (!space) {
    return null;
  }

  const [children, items, rawLinks, breadcrumb] = await Promise.all([
    db
      .select({
        id: homeSpaces.id,
        name: homeSpaces.name,
        kind: homeSpaces.kind,
        sortOrder: homeSpaces.sortOrder,
      })
      .from(homeSpaces)
      .where(eq(homeSpaces.parentId, id))
      .orderBy(homeSpaces.sortOrder, homeSpaces.name),
    db
      .select()
      .from(homeItems)
      .where(eq(homeItems.spaceId, id))
      .orderBy(homeItems.kind, homeItems.name),
    db
      .select()
      .from(homeLinks)
      .where(and(eq(homeLinks.sourceType, "home_space"), eq(homeLinks.sourceId, id)))
      .orderBy(homeLinks.createdAt),
    walkBreadcrumb(id),
  ]);

  const links = await resolveLinks(rawLinks);
  return { ...space, children, items, links, breadcrumb };
}

export async function getHomeItemById(id: string): Promise<HomeItemDetail | null> {
  await requireUser();
  const db = getDb();

  const [item] = await db.select().from(homeItems).where(eq(homeItems.id, id)).limit(1);
  if (!item) {
    return null;
  }

  const [spaceRow, rawLinks] = await Promise.all([
    db
      .select({
        id: homeSpaces.id,
        name: homeSpaces.name,
        kind: homeSpaces.kind,
        sortOrder: homeSpaces.sortOrder,
      })
      .from(homeSpaces)
      .where(eq(homeSpaces.id, item.spaceId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(homeLinks)
      .where(and(eq(homeLinks.sourceType, "home_item"), eq(homeLinks.sourceId, id)))
      .orderBy(homeLinks.createdAt),
  ]);

  if (!spaceRow) {
    return null;
  }

  const links = await resolveLinks(rawLinks);
  return { ...item, space: spaceRow, links };
}

export async function getHomeLogHomeSummary(limit = 5): Promise<HomeSpace[]> {
  await requireUser();
  return getDb()
    .select()
    .from(homeSpaces)
    .where(sql`${homeSpaces.parentId} IS NULL`)
    .orderBy(desc(homeSpaces.updatedAt))
    .limit(limit);
}

export async function getHomeLogHomeStats(): Promise<{
  totalSpaces: number;
  totalItems: number;
}> {
  await requireUser();
  const db = getDb();
  const [spacesRow, itemsRow] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(homeSpaces),
    db.select({ count: sql<number>`count(*)` }).from(homeItems),
  ]);
  return {
    totalSpaces: spacesRow[0]?.count ?? 0,
    totalItems: itemsRow[0]?.count ?? 0,
  };
}

export async function listHomeReferencesForTarget(
  targetType: HomeLinkTargetType,
  targetId: string,
): Promise<HomeReferenceTarget[]> {
  await requireUser();
  const db = getDb();

  const links = await db
    .select()
    .from(homeLinks)
    .where(and(eq(homeLinks.targetType, targetType), eq(homeLinks.targetId, targetId)))
    .orderBy(homeLinks.createdAt);

  if (links.length === 0) {
    return [];
  }

  const spaceIds = links.filter((l) => l.sourceType === "home_space").map((l) => l.sourceId);
  const itemIds = links.filter((l) => l.sourceType === "home_item").map((l) => l.sourceId);

  const [spacesMap, itemsMap] = await Promise.all([
    spaceIds.length > 0
      ? db
          .select({ id: homeSpaces.id, name: homeSpaces.name, kind: homeSpaces.kind })
          .from(homeSpaces)
          .where(
            sql`${homeSpaces.id} IN (${sql.join(
              spaceIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
          .then((rows) => new Map(rows.map((r) => [r.id, r])))
      : Promise.resolve(new Map<string, { id: string; name: string; kind: HomeSpaceKind }>()),
    itemIds.length > 0
      ? db
          .select({
            id: homeItems.id,
            name: homeItems.name,
            kind: homeItems.kind,
            spaceId: homeItems.spaceId,
          })
          .from(homeItems)
          .where(
            sql`${homeItems.id} IN (${sql.join(
              itemIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
          .then((rows) => new Map(rows.map((r) => [r.id, r])))
      : Promise.resolve(
          new Map<string, { id: string; name: string; kind: HomeItemKind; spaceId: string }>(),
        ),
  ]);

  const results: HomeReferenceTarget[] = [];
  for (const link of links) {
    if (link.sourceType === "home_space") {
      const space = spacesMap.get(link.sourceId);
      if (space) {
        results.push({
          sourceType: "home_space",
          sourceId: space.id,
          sourceName: space.name,
          sourceKind: space.kind,
          spaceId: null,
        });
      }
    } else {
      const item = itemsMap.get(link.sourceId);
      if (item) {
        results.push({
          sourceType: "home_item",
          sourceId: item.id,
          sourceName: item.name,
          sourceKind: item.kind,
          spaceId: item.spaceId,
        });
      }
    }
  }
  return results;
}

export async function searchMaintenanceForLink(
  query: string,
): Promise<{ id: string; title: string }[]> {
  await requireUser();
  const trimmed = query.trim();
  if (!trimmed) return [];
  const pattern = searchPattern(trimmed);
  return getDb()
    .select({ id: maintenanceLogs.id, title: maintenanceLogs.title })
    .from(maintenanceLogs)
    .where(sql`lower(${maintenanceLogs.title}) like ${pattern}`)
    .orderBy(desc(maintenanceLogs.updatedAt))
    .limit(10);
}

export async function searchInventoryForHomeLink(
  query: string,
): Promise<{ id: string; name: string }[]> {
  await requireUser();
  const trimmed = query.trim();
  if (!trimmed) return [];
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

export async function searchProjectsForHomeLink(
  query: string,
): Promise<{ id: string; title: string }[]> {
  await requireUser();
  const trimmed = query.trim();
  if (!trimmed) return [];
  const pattern = searchPattern(trimmed);
  return getDb()
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(sql`lower(${projects.title}) like ${pattern}`)
    .orderBy(desc(projects.updatedAt))
    .limit(10);
}

// ---------------------------------------------------------------------------
// Space mutations
// ---------------------------------------------------------------------------

export async function createHomeSpace(
  _prev: HomeActionState,
  formData: FormData,
): Promise<HomeActionState> {
  const { user } = await requireUser();
  const parsed = z
    .object({
      name: nameSchema,
      kind: z.enum(["property", "structure", "room", "area"] as const),
      parentId: z.string().uuid().optional().nullable(),
      address: optionalText(500),
      notes: notesSchema,
    })
    .safeParse({
      name: formData.get("name"),
      kind: formData.get("kind") || "property",
      parentId: formData.get("parentId") || null,
      address: formData.get("address") || undefined,
      notes: formData.get("notes") || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const data = parsed.data;

  await getDb()
    .insert(homeSpaces)
    .values({
      id,
      parentId: data.parentId ?? null,
      kind: data.kind,
      name: data.name,
      address: data.address ?? null,
      notes: data.notes ?? null,
      sortOrder: 0,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

  if (data.notes) {
    await emitMentions({
      body: data.notes,
      entityType: HOME_SPACE_ENTITY_TYPE,
      entityId: id,
      actorId: user.id,
    });
  }

  await emitHouseholdActivity({
    type: "home_log.space_created",
    actorId: user.id,
    entityType: HOME_SPACE_ENTITY_TYPE,
    entityId: id,
    summary: `${displayName(user)} added a space to the home log: ${data.name}`,
  });

  revalidateHomePaths(data.parentId ?? undefined);
  redirect(`/home-log/${id}`);
}

export async function updateHomeSpace(
  _prev: HomeActionState,
  formData: FormData,
): Promise<HomeActionState> {
  const { user } = await requireUser();
  const parsed = z
    .object({
      id: z.string().uuid(),
      name: nameSchema.optional(),
      kind: z.enum(["property", "structure", "room", "area"] as const).optional(),
      address: optionalText(500).nullable(),
      notes: notesSchema,
    })
    .safeParse({
      id: formData.get("id"),
      name: formData.get("name") || undefined,
      kind: formData.get("kind") || undefined,
      address: formData.has("address") ? formData.get("address") || null : undefined,
      notes: formData.has("notes") ? formData.get("notes") || "" : undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { id, ...updates } = parsed.data;
  const db = getDb();
  const [existing] = await db.select().from(homeSpaces).where(eq(homeSpaces.id, id)).limit(1);
  if (!existing) {
    return { error: "Space not found" };
  }

  const now = new Date();
  const patch: Partial<typeof homeSpaces.$inferInsert> = {
    updatedByUserId: user.id,
    updatedAt: now,
  };

  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.kind !== undefined) patch.kind = updates.kind;
  if (updates.address !== undefined) patch.address = updates.address;
  if (updates.notes !== undefined) patch.notes = updates.notes || null;

  await db.update(homeSpaces).set(patch).where(eq(homeSpaces.id, id));

  if (updates.notes !== undefined) {
    await emitMentions({
      body: updates.notes ?? "",
      entityType: HOME_SPACE_ENTITY_TYPE,
      entityId: id,
      actorId: user.id,
    });
  }

  await emitHouseholdActivity({
    type: "home_log.space_updated",
    actorId: user.id,
    entityType: HOME_SPACE_ENTITY_TYPE,
    entityId: id,
    summary: `${displayName(user)} updated home space: ${patch.name ?? existing.name}`,
  });

  revalidateHomePaths(id, undefined);
  return { success: "Saved" };
}

export async function deleteHomeSpace(
  _prev: HomeActionState,
  formData: FormData,
): Promise<HomeActionState> {
  const { user } = await requireUser();
  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });

  if (!parsed.success) {
    return { error: "Invalid space" };
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(homeSpaces)
    .where(eq(homeSpaces.id, parsed.data.id))
    .limit(1);
  if (!existing) {
    return { error: "Space not found" };
  }

  // Collect all descendant space IDs for home_links cleanup (no FK cascade on home_links source)
  const descendantIds = await collectDescendantSpaceIds(parsed.data.id);
  const allSpaceIds = [parsed.data.id, ...descendantIds];

  // Delete home_links where source is one of the collected spaces (children cascade on DB side)
  for (const spaceId of allSpaceIds) {
    await db
      .delete(homeLinks)
      .where(and(eq(homeLinks.sourceType, "home_space"), eq(homeLinks.sourceId, spaceId)));
  }

  // Also delete home_links for items within those spaces
  const itemsInSpaces = await db
    .select({ id: homeItems.id })
    .from(homeItems)
    .where(
      sql`${homeItems.spaceId} IN (${sql.join(
        allSpaceIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  for (const item of itemsInSpaces) {
    await db
      .delete(homeLinks)
      .where(and(eq(homeLinks.sourceType, "home_item"), eq(homeLinks.sourceId, item.id)));
  }

  // Delete the space (cascades to children, items via DB FK)
  await db.delete(homeSpaces).where(eq(homeSpaces.id, parsed.data.id));

  await emitHouseholdActivity({
    type: "home_log.space_deleted",
    actorId: user.id,
    entityType: HOME_SPACE_ENTITY_TYPE,
    entityId: parsed.data.id,
    summary: `${displayName(user)} deleted home space: ${existing.name}`,
  });

  const parentId = existing.parentId;
  revalidateHomePaths();
  if (parentId) {
    redirect(`/home-log/${parentId}`);
  } else {
    redirect("/home-log");
  }
}

async function collectDescendantSpaceIds(spaceId: string): Promise<string[]> {
  const db = getDb();
  const ids: string[] = [];
  const queue = [spaceId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = await db
      .select({ id: homeSpaces.id })
      .from(homeSpaces)
      .where(eq(homeSpaces.parentId, current));
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }

  return ids;
}

export async function updateHomeSpaceNotes(
  spaceId: string,
  notes: string,
): Promise<{ error?: string }> {
  const { user } = await requireUser();
  const parsed = z
    .object({ spaceId: z.string().uuid(), notes: z.string().max(10_000) })
    .safeParse({ spaceId, notes });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  const [existing] = await db.select().from(homeSpaces).where(eq(homeSpaces.id, spaceId)).limit(1);
  if (!existing) {
    return { error: "Space not found" };
  }

  const now = new Date();
  await db
    .update(homeSpaces)
    .set({ notes: notes.trim() ? notes : null, updatedByUserId: user.id, updatedAt: now })
    .where(eq(homeSpaces.id, spaceId));

  await emitMentions({
    body: notes,
    entityType: HOME_SPACE_ENTITY_TYPE,
    entityId: spaceId,
    actorId: user.id,
  });

  revalidateHomePaths(spaceId);
  return {};
}

// ---------------------------------------------------------------------------
// Item mutations
// ---------------------------------------------------------------------------

export async function createHomeItem(
  _prev: HomeActionState,
  formData: FormData,
): Promise<HomeActionState> {
  const { user } = await requireUser();
  const parsed = z
    .object({
      spaceId: z.string().uuid(),
      kind: z.enum([
        "paint",
        "appliance",
        "electrical",
        "plumbing",
        "fixture",
        "flooring",
        "window_treatment",
        "generic",
      ] as const),
      name: nameSchema,
      manufacturer: optionalText(200),
      modelNumber: optionalText(200),
      serialNumber: optionalText(200),
      colorName: optionalText(200),
      colorHex: optionalText(20),
      finish: optionalText(200),
      productUrl: urlSchema,
      notes: notesSchema,
    })
    .safeParse({
      spaceId: formData.get("spaceId"),
      kind: formData.get("kind") || "generic",
      name: formData.get("name"),
      manufacturer: formData.get("manufacturer") || undefined,
      modelNumber: formData.get("modelNumber") || undefined,
      serialNumber: formData.get("serialNumber") || undefined,
      colorName: formData.get("colorName") || undefined,
      colorHex: formData.get("colorHex") || undefined,
      finish: formData.get("finish") || undefined,
      productUrl: formData.get("productUrl") || undefined,
      notes: formData.get("notes") || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;

  // Validate space exists
  const [space] = await getDb()
    .select({ id: homeSpaces.id })
    .from(homeSpaces)
    .where(eq(homeSpaces.id, data.spaceId))
    .limit(1);
  if (!space) {
    return { error: "Space not found" };
  }

  const normalizedHex = data.colorHex ? normalizeColorHex(data.colorHex) : null;

  const now = new Date();
  const id = crypto.randomUUID();

  await getDb()
    .insert(homeItems)
    .values({
      id,
      spaceId: data.spaceId,
      kind: data.kind,
      name: data.name,
      manufacturer: data.manufacturer ?? null,
      modelNumber: data.modelNumber ?? null,
      serialNumber: data.serialNumber ?? null,
      colorName: data.colorName ?? null,
      colorHex: normalizedHex,
      finish: data.finish ?? null,
      productUrl: data.productUrl ?? null,
      purchasedAt: null,
      notes: data.notes ?? null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

  if (data.notes) {
    await emitMentions({
      body: data.notes,
      entityType: HOME_ITEM_ENTITY_TYPE,
      entityId: id,
      actorId: user.id,
    });
  }

  await emitHouseholdActivity({
    type: "home_log.item_created",
    actorId: user.id,
    entityType: HOME_ITEM_ENTITY_TYPE,
    entityId: id,
    summary: `${displayName(user)} added an item to the home log: ${data.name}`,
  });

  revalidateHomePaths(data.spaceId, id);
  redirect(`/home-log/items/${id}`);
}

export async function updateHomeItem(
  _prev: HomeActionState,
  formData: FormData,
): Promise<HomeActionState> {
  const { user } = await requireUser();
  const parsed = z
    .object({
      id: z.string().uuid(),
      name: nameSchema.optional(),
      kind: z
        .enum([
          "paint",
          "appliance",
          "electrical",
          "plumbing",
          "fixture",
          "flooring",
          "window_treatment",
          "generic",
        ] as const)
        .optional(),
      manufacturer: optionalText(200).nullable(),
      modelNumber: optionalText(200).nullable(),
      serialNumber: optionalText(200).nullable(),
      colorName: optionalText(200).nullable(),
      colorHex: optionalText(20).nullable(),
      finish: optionalText(200).nullable(),
      productUrl: urlSchema,
      notes: notesSchema,
    })
    .safeParse({
      id: formData.get("id"),
      name: formData.get("name") || undefined,
      kind: formData.get("kind") || undefined,
      manufacturer: formData.has("manufacturer") ? formData.get("manufacturer") || null : undefined,
      modelNumber: formData.has("modelNumber") ? formData.get("modelNumber") || null : undefined,
      serialNumber: formData.has("serialNumber") ? formData.get("serialNumber") || null : undefined,
      colorName: formData.has("colorName") ? formData.get("colorName") || null : undefined,
      colorHex: formData.has("colorHex") ? formData.get("colorHex") || null : undefined,
      finish: formData.has("finish") ? formData.get("finish") || null : undefined,
      productUrl: formData.has("productUrl") ? formData.get("productUrl") || undefined : undefined,
      notes: formData.has("notes") ? formData.get("notes") || "" : undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { id, ...updates } = parsed.data;
  const db = getDb();
  const [existing] = await db.select().from(homeItems).where(eq(homeItems.id, id)).limit(1);
  if (!existing) {
    return { error: "Item not found" };
  }

  const now = new Date();
  const patch: Partial<typeof homeItems.$inferInsert> = {
    updatedByUserId: user.id,
    updatedAt: now,
  };

  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.kind !== undefined) patch.kind = updates.kind;
  if (updates.manufacturer !== undefined) patch.manufacturer = updates.manufacturer;
  if (updates.modelNumber !== undefined) patch.modelNumber = updates.modelNumber;
  if (updates.serialNumber !== undefined) patch.serialNumber = updates.serialNumber;
  if (updates.colorName !== undefined) patch.colorName = updates.colorName;
  if (updates.colorHex !== undefined) {
    patch.colorHex = updates.colorHex ? (normalizeColorHex(updates.colorHex) ?? null) : null;
  }
  if (updates.finish !== undefined) patch.finish = updates.finish;
  if (updates.productUrl !== undefined) patch.productUrl = updates.productUrl ?? null;
  if (updates.notes !== undefined) patch.notes = updates.notes || null;

  await db.update(homeItems).set(patch).where(eq(homeItems.id, id));

  if (updates.notes !== undefined) {
    await emitMentions({
      body: updates.notes ?? "",
      entityType: HOME_ITEM_ENTITY_TYPE,
      entityId: id,
      actorId: user.id,
    });
  }

  await emitHouseholdActivity({
    type: "home_log.item_updated",
    actorId: user.id,
    entityType: HOME_ITEM_ENTITY_TYPE,
    entityId: id,
    summary: `${displayName(user)} updated home item: ${patch.name ?? existing.name}`,
  });

  revalidateHomePaths(existing.spaceId, id);
  return { success: "Saved" };
}

export async function updateHomeItemNotes(
  itemId: string,
  notes: string,
): Promise<{ error?: string }> {
  const { user } = await requireUser();
  const parsed = z
    .object({ itemId: z.string().uuid(), notes: z.string().max(10_000) })
    .safeParse({ itemId, notes });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  const [existing] = await db.select().from(homeItems).where(eq(homeItems.id, itemId)).limit(1);
  if (!existing) {
    return { error: "Item not found" };
  }

  const now = new Date();
  await db
    .update(homeItems)
    .set({ notes: notes.trim() ? notes : null, updatedByUserId: user.id, updatedAt: now })
    .where(eq(homeItems.id, itemId));

  await emitMentions({
    body: notes,
    entityType: HOME_ITEM_ENTITY_TYPE,
    entityId: itemId,
    actorId: user.id,
  });

  revalidateHomePaths(existing.spaceId, itemId);
  return {};
}

export async function deleteHomeItem(
  _prev: HomeActionState,
  formData: FormData,
): Promise<HomeActionState> {
  const { user } = await requireUser();
  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: formData.get("id") });

  if (!parsed.success) {
    return { error: "Invalid item" };
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(homeItems)
    .where(eq(homeItems.id, parsed.data.id))
    .limit(1);
  if (!existing) {
    return { error: "Item not found" };
  }

  // Clean up home_links (source side)
  await db
    .delete(homeLinks)
    .where(and(eq(homeLinks.sourceType, "home_item"), eq(homeLinks.sourceId, parsed.data.id)));

  await db.delete(homeItems).where(eq(homeItems.id, parsed.data.id));

  await emitHouseholdActivity({
    type: "home_log.item_deleted",
    actorId: user.id,
    entityType: HOME_ITEM_ENTITY_TYPE,
    entityId: parsed.data.id,
    summary: `${displayName(user)} deleted home item: ${existing.name}`,
  });

  revalidateHomePaths(existing.spaceId);
  redirect(`/home-log/${existing.spaceId}`);
}

// ---------------------------------------------------------------------------
// Cross-entity link mutations
// ---------------------------------------------------------------------------

export async function linkHomeEntity(
  _prev: HomeActionState,
  formData: FormData,
): Promise<HomeActionState> {
  const { user } = await requireUser();
  const parsed = z
    .object({
      sourceType: z.enum(["home_space", "home_item"] as const),
      sourceId: z.string().uuid(),
      targetType: z.enum(["maintenance_log", "inventory_item", "project"] as const),
      targetId: z.string().uuid(),
    })
    .safeParse({
      sourceType: formData.get("sourceType"),
      sourceId: formData.get("sourceId"),
      targetType: formData.get("targetType"),
      targetId: formData.get("targetId"),
    });

  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const { sourceType, sourceId, targetType, targetId } = parsed.data;

  await getDb()
    .insert(homeLinks)
    .values({
      id: crypto.randomUUID(),
      sourceType,
      sourceId,
      targetType,
      targetId,
      createdByUserId: user.id,
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  if (sourceType === "home_space") {
    revalidateHomePaths(sourceId);
  } else {
    revalidateHomePaths(undefined, sourceId);
  }
  // Also revalidate the target page so back-links update
  revalidateTargetPath(targetType, targetId);
  return { success: "Linked" };
}

export async function unlinkHomeEntity(
  _prev: HomeActionState,
  formData: FormData,
): Promise<HomeActionState> {
  await requireUser();
  const parsed = z
    .object({
      sourceType: z.enum(["home_space", "home_item"] as const),
      sourceId: z.string().uuid(),
      targetType: z.enum(["maintenance_log", "inventory_item", "project"] as const),
      targetId: z.string().uuid(),
    })
    .safeParse({
      sourceType: formData.get("sourceType"),
      sourceId: formData.get("sourceId"),
      targetType: formData.get("targetType"),
      targetId: formData.get("targetId"),
    });

  if (!parsed.success) {
    return { error: "Invalid input" };
  }

  const { sourceType, sourceId, targetType, targetId } = parsed.data;

  await getDb()
    .delete(homeLinks)
    .where(
      and(
        eq(homeLinks.sourceType, sourceType),
        eq(homeLinks.sourceId, sourceId),
        eq(homeLinks.targetType, targetType),
        eq(homeLinks.targetId, targetId),
      ),
    );

  if (sourceType === "home_space") {
    revalidateHomePaths(sourceId);
  } else {
    revalidateHomePaths(undefined, sourceId);
  }
  revalidateTargetPath(targetType, targetId);
  return { success: "Unlinked" };
}

/**
 * Remove all home_links that point TO a given target. Called from target entity delete actions.
 */
export async function removeHomeLinksForTarget(
  targetType: HomeLinkTargetType,
  targetId: string,
): Promise<void> {
  await getDb()
    .delete(homeLinks)
    .where(and(eq(homeLinks.targetType, targetType), eq(homeLinks.targetId, targetId)));
}

function revalidateTargetPath(targetType: HomeLinkTargetType, targetId: string): void {
  switch (targetType) {
    case "maintenance_log":
      revalidatePath(`/maintenance/${targetId}`);
      break;
    case "inventory_item":
      revalidatePath(`/inventory/${targetId}`);
      break;
    case "project":
      revalidatePath(`/projects/${targetId}`);
      break;
  }
}
