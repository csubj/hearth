import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { metricEntries } from "@/db/schema";
import type { EntityType } from "@/lib/notifications/emit";

export async function getNotificationHref(
  entityType: EntityType | string | null,
  entityId: string | null,
): Promise<string | null> {
  if (!entityType || !entityId) {
    return null;
  }

  switch (entityType) {
    case "stream_entry":
      return `/stream#entry-${entityId}`;
    case "restaurant":
      return `/restaurants/${entityId}`;
    case "project":
      return `/projects/${entityId}`;
    case "metric":
      return `/metrics/${entityId}`;
    case "metric_entry": {
      const [entry] = await getDb()
        .select({ metricId: metricEntries.metricId })
        .from(metricEntries)
        .where(eq(metricEntries.id, entityId))
        .limit(1);
      return entry ? `/metrics/${entry.metricId}` : null;
    }
    case "inventory_item":
      return `/inventory/${entityId}`;
    default:
      return null;
  }
}
