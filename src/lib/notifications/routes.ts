import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { trackerEntries } from "@/db/schema";
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
    case "tracker":
      return `/trackers/${entityId}`;
    case "tracker_entry": {
      const [entry] = await getDb()
        .select({ trackerId: trackerEntries.trackerId })
        .from(trackerEntries)
        .where(eq(trackerEntries.id, entityId))
        .limit(1);
      return entry ? `/trackers/${entry.trackerId}` : null;
    }
    case "event":
      return "/events";
    default:
      return null;
  }
}
