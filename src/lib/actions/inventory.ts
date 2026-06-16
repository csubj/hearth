"use server";

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import {
  inventoryItemTags,
  inventoryItems,
  inventoryLinks,
  inventoryTags,
  type InventoryItem,
  type InventoryLink,
  type InventoryTag,
} from "@/db/schema/inventory";
import { attachments } from "@/db/schema";
import { displayName, requireUser } from "@/lib/auth/session";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";

const INVENTORY_ENTITY_TYPE = "inventory_item" as const;

export type InventoryActionState = {
  error?: string;
  success?: string;
};

export type InventoryListItem = InventoryItem & {
  tags: InventoryTag[];
};

export type InventoryDetail = InventoryItem & {
  tags: InventoryTag[];
  links: InventoryLink[];
};

export type InventoryListFilters = {
  q?: string;
  tag?: string;
  itemType?: string;
};

export type InventoryExportAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

export type InventoryExportItem = {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial: string | null;
  itemType: string | null;
  location: string | null;
  purchaseDate: string | null;
  store: string | null;
  price: string | null;
  warrantyNote: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  links: Array<{ label: string; url: string }>;
  attachments: InventoryExportAttachment[];
};

export type InventoryExportPayload = {
  version: 1;
  exportedAt: string;
  tags: Array<{ id: string; name: string }>;
  items: InventoryExportItem[];
};

const nameSchema = z.string().trim().min(1, "Name is required").max(200);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const urlSchema = z.string().trim().url("Valid URL is required").max(2000);

const itemFieldsSchema = z.object({
  name: nameSchema,
  brand: optionalText(200),
  model: optionalText(200),
  serial: optionalText(200),
  itemType: optionalText(100),
  location: optionalText(200),
  purchaseDate: z.coerce.date().optional(),
  store: optionalText(200),
  price: optionalText(50),
  warrantyNote: optionalText(2000),
  notes: optionalText(5000),
});

function parseListFilters(
  searchParams: Record<string, string | string[] | undefined>,
): InventoryListFilters {
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : undefined;
  const tag = typeof searchParams.tag === "string" ? searchParams.tag.trim() : undefined;
  const itemType =
    typeof searchParams.type === "string" ? searchParams.type.trim() : undefined;

  return {
    q: q || undefined,
    tag: tag || undefined,
    itemType: itemType || undefined,
  };
}

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
  await getDb()
    .insert(inventoryTags)
    .values({ id, name: trimmed, createdAt: now });
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

export async function listInventoryTags(): Promise<InventoryTag[]> {
  await requireUser();
  return getDb().select().from(inventoryTags).orderBy(inventoryTags.name);
}

export async function listInventoryItemTypes(): Promise<string[]> {
  await requireUser();
  const rows = await getDb()
    .selectDistinct({ itemType: inventoryItems.itemType })
    .from(inventoryItems)
    .where(sql`${inventoryItems.itemType} IS NOT NULL AND ${inventoryItems.itemType} != ''`)
    .orderBy(inventoryItems.itemType);

  return rows
    .map((row) => row.itemType)
    .filter((value): value is string => Boolean(value?.trim()));
}

export async function listInventoryItems(
  searchParams: Record<string, string | string[] | undefined> = {},
): Promise<InventoryListItem[]> {
  await requireUser();
  const { q, tag, itemType } = parseListFilters(searchParams);
  const db = getDb();

  const conditions = [];

  if (q) {
    const pattern = searchPattern(q);
    conditions.push(
      or(
        sql`lower(${inventoryItems.name}) like ${pattern}`,
        sql`lower(coalesce(${inventoryItems.brand}, '')) like ${pattern}`,
        sql`lower(coalesce(${inventoryItems.model}, '')) like ${pattern}`,
        sql`lower(coalesce(${inventoryItems.serial}, '')) like ${pattern}`,
        sql`lower(coalesce(${inventoryItems.location}, '')) like ${pattern}`,
        sql`lower(coalesce(${inventoryItems.notes}, '')) like ${pattern}`,
      ),
    );
  }

  if (itemType) {
    conditions.push(eq(inventoryItems.itemType, itemType));
  }

  let itemIdsFromTag: string[] | null = null;
  if (tag) {
    const tagId = await resolveTagIdByName(tag);
    if (!tagId) {
      return [];
    }
    const tagged = await db
      .select({ itemId: inventoryItemTags.inventoryItemId })
      .from(inventoryItemTags)
      .where(eq(inventoryItemTags.tagId, tagId));
    itemIdsFromTag = tagged.map((row) => row.itemId);
    if (itemIdsFromTag.length === 0) {
      return [];
    }
    conditions.push(inArray(inventoryItems.id, itemIdsFromTag));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db
    .select()
    .from(inventoryItems)
    .where(whereClause)
    .orderBy(desc(inventoryItems.updatedAt));

  const tagsByItem = await loadTagsForItems(items.map((item) => item.id));

  return items.map((item) => ({
    ...item,
    tags: tagsByItem.get(item.id) ?? [],
  }));
}

export async function getInventoryItemById(id: string): Promise<InventoryDetail | null> {
  await requireUser();
  const db = getDb();

  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);
  if (!item) {
    return null;
  }

  const [tags, links] = await Promise.all([
    db
      .select({ tag: inventoryTags })
      .from(inventoryItemTags)
      .innerJoin(inventoryTags, eq(inventoryItemTags.tagId, inventoryTags.id))
      .where(eq(inventoryItemTags.inventoryItemId, id))
      .then((rows) => rows.map((row) => row.tag)),
    db
      .select()
      .from(inventoryLinks)
      .where(eq(inventoryLinks.inventoryItemId, id))
      .orderBy(inventoryLinks.createdAt),
  ]);

  return { ...item, tags, links };
}

export async function getInventoryHomeSummary(limit = 5): Promise<InventoryListItem[]> {
  const items = await listInventoryItems({});
  return items.slice(0, limit);
}

export async function create(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { user } = await requireUser();

  const parsed = itemFieldsSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    brand: String(formData.get("brand") ?? "") || undefined,
    model: String(formData.get("model") ?? "") || undefined,
    serial: String(formData.get("serial") ?? "") || undefined,
    itemType: String(formData.get("itemType") ?? "") || undefined,
    location: String(formData.get("location") ?? "") || undefined,
    purchaseDate: String(formData.get("purchaseDate") ?? "") || undefined,
    store: String(formData.get("store") ?? "") || undefined,
    price: String(formData.get("price") ?? "") || undefined,
    warrantyNote: String(formData.get("warrantyNote") ?? "") || undefined,
    notes: String(formData.get("notes") ?? "") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const now = new Date();
  const id = crypto.randomUUID();

  await getDb()
    .insert(inventoryItems)
    .values({
      id,
      name: data.name,
      brand: data.brand ?? null,
      model: data.model ?? null,
      serial: data.serial ?? null,
      itemType: data.itemType ?? null,
      location: data.location ?? null,
      purchaseDate: data.purchaseDate ?? null,
      store: data.store ?? null,
      price: data.price ?? null,
      warrantyNote: data.warrantyNote ?? null,
      notes: data.notes ?? null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "inventory.created",
    actorId: user.id,
    entityType: INVENTORY_ENTITY_TYPE,
    entityId: id,
    summary: `${actor} added ${data.name} to inventory`,
  });

  if (data.notes) {
    await emitMentions({
      body: data.notes,
      entityType: INVENTORY_ENTITY_TYPE,
      entityId: id,
      actorId: user.id,
    });
  }

  revalidatePath("/inventory");
  revalidatePath("/");
  redirect(`/inventory/${id}`);
}

export async function update(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { user } = await requireUser();

  const parsed = itemFieldsSchema
    .extend({ id: z.string().uuid() })
    .safeParse({
      id: String(formData.get("id") ?? ""),
      name: String(formData.get("name") ?? ""),
      brand: String(formData.get("brand") ?? "") || undefined,
      model: String(formData.get("model") ?? "") || undefined,
      serial: String(formData.get("serial") ?? "") || undefined,
      itemType: String(formData.get("itemType") ?? "") || undefined,
      location: String(formData.get("location") ?? "") || undefined,
      purchaseDate: String(formData.get("purchaseDate") ?? "") || undefined,
      store: String(formData.get("store") ?? "") || undefined,
      price: String(formData.get("price") ?? "") || undefined,
      warrantyNote: String(formData.get("warrantyNote") ?? "") || undefined,
      notes: String(formData.get("notes") ?? "") || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, data.id))
    .limit(1);

  if (!existing) {
    return { error: "Item not found." };
  }

  const now = new Date();
  await db
    .update(inventoryItems)
    .set({
      name: data.name,
      brand: data.brand ?? null,
      model: data.model ?? null,
      serial: data.serial ?? null,
      itemType: data.itemType ?? null,
      location: data.location ?? null,
      purchaseDate: data.purchaseDate ?? null,
      store: data.store ?? null,
      price: data.price ?? null,
      warrantyNote: data.warrantyNote ?? null,
      notes: data.notes ?? null,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(inventoryItems.id, data.id));

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "inventory.updated",
    actorId: user.id,
    entityType: INVENTORY_ENTITY_TYPE,
    entityId: data.id,
    summary: `${actor} updated ${data.name}`,
  });

  if (data.notes) {
    await emitMentions({
      body: data.notes,
      entityType: INVENTORY_ENTITY_TYPE,
      entityId: data.id,
      actorId: user.id,
    });
  }

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${data.id}`);
  revalidatePath("/");
  return { success: "Saved." };
}

export async function addLink(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      inventoryItemId: z.string().uuid(),
      label: z.string().trim().min(1, "Label is required").max(100),
      url: urlSchema,
    })
    .safeParse({
      inventoryItemId: String(formData.get("inventoryItemId") ?? ""),
      label: String(formData.get("label") ?? ""),
      url: String(formData.get("url") ?? ""),
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { inventoryItemId, label, url } = parsed.data;
  const item = await getInventoryItemById(inventoryItemId);
  if (!item) {
    return { error: "Item not found." };
  }

  const now = new Date();
  await getDb().insert(inventoryLinks).values({
    id: crypto.randomUUID(),
    inventoryItemId,
    label,
    url,
    createdAt: now,
  });

  await getDb()
    .update(inventoryItems)
    .set({ updatedByUserId: user.id, updatedAt: now })
    .where(eq(inventoryItems.id, inventoryItemId));

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "inventory.updated",
    actorId: user.id,
    entityType: INVENTORY_ENTITY_TYPE,
    entityId: inventoryItemId,
    summary: `${actor} updated ${item.name}`,
  });

  revalidatePath(`/inventory/${inventoryItemId}`);
  revalidatePath("/inventory");
  revalidatePath("/");
  return { success: "Link added." };
}

export async function removeLink(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      linkId: z.string().uuid(),
      inventoryItemId: z.string().uuid(),
    })
    .safeParse({
      linkId: String(formData.get("linkId") ?? ""),
      inventoryItemId: String(formData.get("inventoryItemId") ?? ""),
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { linkId, inventoryItemId } = parsed.data;
  const item = await getInventoryItemById(inventoryItemId);
  if (!item) {
    return { error: "Item not found." };
  }

  await getDb()
    .delete(inventoryLinks)
    .where(and(eq(inventoryLinks.id, linkId), eq(inventoryLinks.inventoryItemId, inventoryItemId)));

  const now = new Date();
  await getDb()
    .update(inventoryItems)
    .set({ updatedByUserId: user.id, updatedAt: now })
    .where(eq(inventoryItems.id, inventoryItemId));

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "inventory.updated",
    actorId: user.id,
    entityType: INVENTORY_ENTITY_TYPE,
    entityId: inventoryItemId,
    summary: `${actor} updated ${item.name}`,
  });

  revalidatePath(`/inventory/${inventoryItemId}`);
  revalidatePath("/inventory");
  revalidatePath("/");
  return { success: "Link removed." };
}

export async function setTags(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      inventoryItemId: z.string().uuid(),
      tags: z.string().optional(),
    })
    .safeParse({
      inventoryItemId: String(formData.get("inventoryItemId") ?? ""),
      tags: String(formData.get("tags") ?? ""),
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { inventoryItemId, tags: tagsRaw } = parsed.data;
  const item = await getInventoryItemById(inventoryItemId);
  if (!item) {
    return { error: "Item not found." };
  }

  const tagNames = (tagsRaw ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  await replaceItemTags(inventoryItemId, tagNames);

  const now = new Date();
  await getDb()
    .update(inventoryItems)
    .set({ updatedByUserId: user.id, updatedAt: now })
    .where(eq(inventoryItems.id, inventoryItemId));

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "inventory.updated",
    actorId: user.id,
    entityType: INVENTORY_ENTITY_TYPE,
    entityId: inventoryItemId,
    summary: `${actor} updated ${item.name}`,
  });

  revalidatePath(`/inventory/${inventoryItemId}`);
  revalidatePath("/inventory");
  revalidatePath("/");
  return { success: "Tags updated." };
}

function toIsoDate(date: Date | null): string | null {
  if (!date) {
    return null;
  }
  return date.toISOString();
}

export async function buildInventoryExport(): Promise<InventoryExportPayload> {
  await requireUser();
  const db = getDb();
  const [allTags, allItems] = await Promise.all([
    db.select().from(inventoryTags).orderBy(inventoryTags.name),
    db.select().from(inventoryItems).orderBy(desc(inventoryItems.updatedAt)),
  ]);

  const itemIds = allItems.map((item) => item.id);
  const [tagsByItem, allLinks, allAttachments] = await Promise.all([
    loadTagsForItems(itemIds),
    itemIds.length
      ? db.select().from(inventoryLinks).where(inArray(inventoryLinks.inventoryItemId, itemIds))
      : Promise.resolve([]),
    itemIds.length
      ? db
          .select()
          .from(attachments)
          .where(
            and(
              eq(attachments.entityType, "inventory_item"),
              inArray(attachments.entityId, itemIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  const linksByItem = new Map<string, InventoryLink[]>();
  for (const link of allLinks) {
    const current = linksByItem.get(link.inventoryItemId) ?? [];
    current.push(link);
    linksByItem.set(link.inventoryItemId, current);
  }

  const attachmentsByItem = new Map<string, InventoryExportAttachment[]>();
  for (const attachment of allAttachments) {
    const current = attachmentsByItem.get(attachment.entityId) ?? [];
    current.push({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      url: `/api/attachments/${attachment.id}`,
    });
    attachmentsByItem.set(attachment.entityId, current);
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tags: allTags.map((tag) => ({ id: tag.id, name: tag.name })),
    items: allItems.map((item) => ({
      id: item.id,
      name: item.name,
      brand: item.brand,
      model: item.model,
      serial: item.serial,
      itemType: item.itemType,
      location: item.location,
      purchaseDate: toIsoDate(item.purchaseDate),
      store: item.store,
      price: item.price,
      warrantyNote: item.warrantyNote,
      notes: item.notes,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      tags: (tagsByItem.get(item.id) ?? []).map((tag) => tag.name),
      links: (linksByItem.get(item.id) ?? []).map((link) => ({
        label: link.label,
        url: link.url,
      })),
      attachments: attachmentsByItem.get(item.id) ?? [],
    })),
  };
}

const importItemSchema = z.object({
  id: z.string().uuid().optional(),
  name: nameSchema,
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serial: z.string().nullable().optional(),
  itemType: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  purchaseDate: z.string().nullable().optional(),
  store: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  warrantyNote: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  links: z
    .array(
      z.object({
        label: z.string().min(1),
        url: urlSchema,
      }),
    )
    .optional(),
});

const importPayloadSchema = z.object({
  version: z.literal(1).optional(),
  items: z.array(importItemSchema).min(1),
});

export async function importInventoryData(
  payload: unknown,
  userId: string,
): Promise<{ imported: number }> {
  const parsed = importPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? "Invalid import data.");
  }

  const db = getDb();
  const now = new Date();
  let imported = 0;

  for (const item of parsed.data.items) {
    const id = item.id ?? crypto.randomUUID();
    const purchaseDate = item.purchaseDate ? new Date(item.purchaseDate) : null;

    const [existing] = await db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);

    if (existing) {
      await db
        .update(inventoryItems)
        .set({
          name: item.name,
          brand: item.brand ?? null,
          model: item.model ?? null,
          serial: item.serial ?? null,
          itemType: item.itemType ?? null,
          location: item.location ?? null,
          purchaseDate:
            purchaseDate && !Number.isNaN(purchaseDate.getTime()) ? purchaseDate : null,
          store: item.store ?? null,
          price: item.price ?? null,
          warrantyNote: item.warrantyNote ?? null,
          notes: item.notes ?? null,
          updatedByUserId: userId,
          updatedAt: now,
        })
        .where(eq(inventoryItems.id, id));

      await db.delete(inventoryLinks).where(eq(inventoryLinks.inventoryItemId, id));
    } else {
      await db.insert(inventoryItems).values({
        id,
        name: item.name,
        brand: item.brand ?? null,
        model: item.model ?? null,
        serial: item.serial ?? null,
        itemType: item.itemType ?? null,
        location: item.location ?? null,
        purchaseDate:
          purchaseDate && !Number.isNaN(purchaseDate.getTime()) ? purchaseDate : null,
        store: item.store ?? null,
        price: item.price ?? null,
        warrantyNote: item.warrantyNote ?? null,
        notes: item.notes ?? null,
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (item.links?.length) {
      await db.insert(inventoryLinks).values(
        item.links.map((link) => ({
          id: crypto.randomUUID(),
          inventoryItemId: id,
          label: link.label,
          url: link.url,
          createdAt: now,
        })),
      );
    }

    await replaceItemTags(id, item.tags ?? []);
    imported += 1;
  }

  return { imported };
}

