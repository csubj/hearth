import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { metricEntries, projects, restaurants, streamEntries } from "@/db/schema";
import { inventoryItems } from "@/db/schema/inventory";
import type { EntityType } from "@/lib/notifications/emit";

export const ATTACHMENT_ENTITY_TYPES = [
  "stream_entry",
  "restaurant",
  "project",
  "metric_entry",
  "inventory_item",
] as const;

export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

export function isAttachmentEntityType(value: string): value is AttachmentEntityType {
  return (ATTACHMENT_ENTITY_TYPES as readonly string[]).includes(value);
}

export async function entityExists(
  entityType: AttachmentEntityType,
  entityId: string,
): Promise<boolean> {
  const db = getDb();

  switch (entityType) {
    case "stream_entry": {
      const [row] = await db
        .select({ id: streamEntries.id })
        .from(streamEntries)
        .where(eq(streamEntries.id, entityId))
        .limit(1);
      return Boolean(row);
    }
    case "restaurant": {
      const [row] = await db
        .select({ id: restaurants.id })
        .from(restaurants)
        .where(eq(restaurants.id, entityId))
        .limit(1);
      return Boolean(row);
    }
    case "project": {
      const [row] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, entityId))
        .limit(1);
      return Boolean(row);
    }
    case "metric_entry": {
      const [row] = await db
        .select({ id: metricEntries.id })
        .from(metricEntries)
        .where(eq(metricEntries.id, entityId))
        .limit(1);
      return Boolean(row);
    }
    case "inventory_item": {
      const [row] = await db
        .select({ id: inventoryItems.id })
        .from(inventoryItems)
        .where(eq(inventoryItems.id, entityId))
        .limit(1);
      return Boolean(row);
    }
    default: {
      const _exhaustive: never = entityType;
      void _exhaustive;
      return false;
    }
  }
}

export function attachmentEntityTypeFromEntityType(
  entityType: EntityType,
): AttachmentEntityType | null {
  if (isAttachmentEntityType(entityType)) {
    return entityType;
  }
  return null;
}
