import { and, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  inventoryItemTags,
  inventoryItems,
  inventoryTags,
  type InventoryItem,
  type InventoryTag,
} from "@/db/schema/inventory";
import type { AuthUser } from "@/lib/auth/lucia";
import { displayName } from "@/lib/auth/session";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";
import { decodeCursor, paginateRows, type PaginationQuery } from "@/lib/api/pagination";
import { toIso } from "@/lib/api/serialize";
import type {
  createInventoryItemSchema,
  createInventoryTagSchema,
  renameInventoryTypeSchema,
  updateInventoryItemSchema,
  updateInventoryTagSchema,
} from "@/lib/api/schemas";
import type { z } from "zod";

export type InventoryListQuery = PaginationQuery & {
  q?: string;
  tag?: string;
  type?: string;
};

function searchPattern(query: string): string {
  return `%${query.toLowerCase()}%`;
}

async function loadTagsForItems(itemIds: string[]): Promise<Map<string, InventoryTag[]>> {
  const result = new Map<string, InventoryTag[]>();
  if (itemIds.length === 0) {
    return result;
  }

  const rows = await getDb()
    .select({
      itemId: inventoryItemTags.inventoryItemId,
      tag: inventoryTags,
    })
    .from(inventoryItemTags)
    .innerJoin(inventoryTags, eq(inventoryItemTags.tagId, inventoryTags.id))
    .where(inArray(inventoryItemTags.inventoryItemId, itemIds));

  for (const row of rows) {
    const current = result.get(row.itemId) ?? [];
    current.push(row.tag);
    result.set(row.itemId, current);
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
    .from(inventoryTags)
    .where(sql`lower(${inventoryTags.name}) = ${normalized}`)
    .limit(1);

  return existing?.id ?? null;
}

async function getOrCreateTagId(name: string, now: Date): Promise<string> {
  const trimmed = name.trim();
  const normalized = trimmed.toLowerCase();

  const [existing] = await getDb()
    .select()
    .from(inventoryTags)
    .where(sql`lower(${inventoryTags.name}) = ${normalized}`)
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const id = crypto.randomUUID();
  await getDb().insert(inventoryTags).values({ id, name: trimmed, createdAt: now });
  return id;
}

async function replaceItemTags(itemId: string, tagNames: string[]): Promise<void> {
  const db = getDb();
  const now = new Date();
  const uniqueNames = [...new Set(tagNames.map((name) => name.trim()).filter(Boolean))];
  const tagIds: string[] = [];

  for (const name of uniqueNames) {
    tagIds.push(await getOrCreateTagId(name, now));
  }

  await db.delete(inventoryItemTags).where(eq(inventoryItemTags.inventoryItemId, itemId));

  if (tagIds.length > 0) {
    await db.insert(inventoryItemTags).values(
      tagIds.map((tagId) => ({
        inventoryItemId: itemId,
        tagId,
      })),
    );
  }
}

function inventoryCursorCondition(cursor: string): SQL | undefined {
  const decoded = decodeCursor(cursor);
  if (!decoded) {
    return undefined;
  }
  const cursorDate = new Date(decoded.t);
  return or(
    lt(inventoryItems.updatedAt, cursorDate),
    and(eq(inventoryItems.updatedAt, cursorDate), lt(inventoryItems.id, decoded.id)),
  );
}

export function serializeInventoryTag(row: InventoryTag) {
  return {
    id: row.id,
    name: row.name,
    createdAt: toIso(row.createdAt)!,
  };
}

export function serializeInventoryItem(row: InventoryItem, tags: InventoryTag[] = []) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    model: row.model,
    serial: row.serial,
    itemType: row.itemType,
    location: row.location,
    purchaseDate: toIso(row.purchaseDate),
    store: row.store,
    price: row.price,
    warrantyNote: row.warrantyNote,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
    tags: tags.map(serializeInventoryTag),
  };
}

export async function listInventoryItemsApi(query: InventoryListQuery) {
  const db = getDb();
  const conditions: SQL[] = [];

  const cursorFilter = query.cursor ? inventoryCursorCondition(query.cursor) : undefined;
  if (cursorFilter) {
    conditions.push(cursorFilter);
  }

  if (query.q) {
    const pattern = searchPattern(query.q);
    conditions.push(
      or(
        sql`lower(${inventoryItems.name}) like ${pattern}`,
        sql`lower(coalesce(${inventoryItems.brand}, '')) like ${pattern}`,
        sql`lower(coalesce(${inventoryItems.model}, '')) like ${pattern}`,
        sql`lower(coalesce(${inventoryItems.serial}, '')) like ${pattern}`,
        sql`lower(coalesce(${inventoryItems.location}, '')) like ${pattern}`,
        sql`lower(coalesce(${inventoryItems.notes}, '')) like ${pattern}`,
      )!,
    );
  }

  if (query.type) {
    conditions.push(eq(inventoryItems.itemType, query.type));
  }

  if (query.tag) {
    const tagId = await resolveTagIdByName(query.tag);
    if (!tagId) {
      return { data: [], nextCursor: null };
    }
    const tagged = await db
      .select({ itemId: inventoryItemTags.inventoryItemId })
      .from(inventoryItemTags)
      .where(eq(inventoryItemTags.tagId, tagId));
    const itemIds = tagged.map((row) => row.itemId);
    if (itemIds.length === 0) {
      return { data: [], nextCursor: null };
    }
    conditions.push(inArray(inventoryItems.id, itemIds));
  }

  const rows = await db
    .select()
    .from(inventoryItems)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(inventoryItems.updatedAt), desc(inventoryItems.id))
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const data = hasMore ? rows.slice(0, query.limit) : rows;
  const tagsByItem = await loadTagsForItems(data.map((row) => row.id));
  const last = data.at(-1);
  const nextCursor =
    hasMore && last
      ? Buffer.from(JSON.stringify({ t: last.updatedAt.getTime(), id: last.id })).toString(
          "base64url",
        )
      : null;

  return {
    data: data.map((row) => ({
      ...row,
      tags: tagsByItem.get(row.id) ?? [],
    })),
    nextCursor,
  };
}

export async function getInventoryItemApi(id: string) {
  const [item] = await getDb()
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1);
  if (!item) {
    return null;
  }

  const tagsByItem = await loadTagsForItems([id]);
  return { ...item, tags: tagsByItem.get(id) ?? [] };
}

export async function createInventoryItemApi(
  user: AuthUser,
  input: z.infer<typeof createInventoryItemSchema>,
) {
  const now = new Date();
  const id = crypto.randomUUID();

  await getDb()
    .insert(inventoryItems)
    .values({
      id,
      name: input.name,
      brand: input.brand ?? null,
      model: input.model ?? null,
      serial: input.serial ?? null,
      itemType: input.itemType ?? null,
      location: input.location ?? null,
      purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
      store: input.store ?? null,
      price: input.price ?? null,
      warrantyNote: input.warrantyNote ?? null,
      notes: input.notes ?? null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

  if (input.tags?.length) {
    await replaceItemTags(id, input.tags);
  }

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "inventory.created",
    actorId: user.id,
    entityType: "inventory_item",
    entityId: id,
    summary: `${actor} added ${input.name} to inventory`,
  });

  if (input.notes) {
    await emitMentions({
      body: input.notes,
      entityType: "inventory_item",
      entityId: id,
      actorId: user.id,
    });
  }

  return getInventoryItemApi(id);
}

export async function updateInventoryItemApi(
  user: AuthUser,
  id: string,
  input: z.infer<typeof updateInventoryItemSchema>,
) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1);
  if (!existing) {
    return null;
  }

  const now = new Date();
  await db
    .update(inventoryItems)
    .set({
      name: input.name ?? existing.name,
      brand: input.brand !== undefined ? input.brand : existing.brand,
      model: input.model !== undefined ? input.model : existing.model,
      serial: input.serial !== undefined ? input.serial : existing.serial,
      itemType: input.itemType !== undefined ? input.itemType : existing.itemType,
      location: input.location !== undefined ? input.location : existing.location,
      purchaseDate:
        input.purchaseDate !== undefined
          ? input.purchaseDate
            ? new Date(input.purchaseDate)
            : null
          : existing.purchaseDate,
      store: input.store !== undefined ? input.store : existing.store,
      price: input.price !== undefined ? input.price : existing.price,
      warrantyNote: input.warrantyNote !== undefined ? input.warrantyNote : existing.warrantyNote,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(inventoryItems.id, id));

  if (input.tags !== undefined) {
    await replaceItemTags(id, input.tags);
  }

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "inventory.updated",
    actorId: user.id,
    entityType: "inventory_item",
    entityId: id,
    summary: `${actor} updated ${input.name ?? existing.name}`,
  });

  return getInventoryItemApi(id);
}

export async function deleteInventoryItemApi(id: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1);
  if (!existing) {
    return false;
  }
  await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
  return true;
}

export async function listInventoryTagsApi(query: PaginationQuery) {
  const db = getDb();
  const conditions = [];
  const decoded = query.cursor ? decodeCursor(query.cursor) : null;
  if (decoded) {
    const cursorDate = new Date(decoded.t);
    conditions.push(
      or(
        lt(inventoryTags.createdAt, cursorDate),
        and(eq(inventoryTags.createdAt, cursorDate), lt(inventoryTags.id, decoded.id)),
      ),
    );
  }

  const rows = await db
    .select()
    .from(inventoryTags)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(inventoryTags.createdAt), desc(inventoryTags.id))
    .limit(query.limit + 1);

  return paginateRows(rows, query.limit);
}

export async function getInventoryTagApi(id: string) {
  const [row] = await getDb().select().from(inventoryTags).where(eq(inventoryTags.id, id)).limit(1);
  return row ?? null;
}

export async function createInventoryTagApi(
  _user: AuthUser,
  input: z.infer<typeof createInventoryTagSchema>,
) {
  const now = new Date();
  const id = await getOrCreateTagId(input.name, now);
  return getInventoryTagApi(id);
}

export async function updateInventoryTagApi(
  id: string,
  input: z.infer<typeof updateInventoryTagSchema>,
) {
  const db = getDb();
  const [existing] = await db.select().from(inventoryTags).where(eq(inventoryTags.id, id)).limit(1);
  if (!existing) {
    return null;
  }

  const [updated] = await db
    .update(inventoryTags)
    .set({ name: input.name.trim() })
    .where(eq(inventoryTags.id, id))
    .returning();

  return updated ?? null;
}

export async function deleteInventoryTagApi(id: string) {
  const db = getDb();
  const [existing] = await db.select().from(inventoryTags).where(eq(inventoryTags.id, id)).limit(1);
  if (!existing) {
    return false;
  }
  await db.delete(inventoryTags).where(eq(inventoryTags.id, id));
  return true;
}

export async function listInventoryTypesApi() {
  const rows = await getDb()
    .selectDistinct({ itemType: inventoryItems.itemType })
    .from(inventoryItems)
    .where(sql`${inventoryItems.itemType} IS NOT NULL AND ${inventoryItems.itemType} != ''`)
    .orderBy(inventoryItems.itemType);

  return rows.map((row) => row.itemType).filter((value): value is string => Boolean(value?.trim()));
}

export async function renameInventoryTypeApi(
  currentName: string,
  input: z.infer<typeof renameInventoryTypeSchema>,
) {
  const db = getDb();
  const [match] = await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(eq(inventoryItems.itemType, currentName))
    .limit(1);

  if (!match) {
    return null;
  }

  await db
    .update(inventoryItems)
    .set({ itemType: input.name.trim() })
    .where(eq(inventoryItems.itemType, currentName));

  return { name: input.name.trim() };
}

export async function deleteInventoryTypeApi(name: string) {
  const db = getDb();
  const [match] = await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(eq(inventoryItems.itemType, name))
    .limit(1);

  if (!match) {
    return false;
  }

  await db.update(inventoryItems).set({ itemType: null }).where(eq(inventoryItems.itemType, name));

  return true;
}
