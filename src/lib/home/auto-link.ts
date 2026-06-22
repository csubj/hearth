import type { HomeLinkSourceType, HomeLinkTargetType } from "@/db/schema";
import { createHomeLink } from "@/lib/actions/home";

const SOURCE_TYPES: readonly HomeLinkSourceType[] = ["home_space", "home_item"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * If the form carries home-log link context (homeLinkSourceType + homeLinkSourceId),
 * link the freshly created resource to that home space/item. No-op otherwise.
 *
 * Used by project/maintenance/inventory create actions so a resource created from
 * within a home-log section is automatically associated with the current space.
 */
export async function maybeAutoLinkToHome(
  formData: FormData,
  targetType: HomeLinkTargetType,
  targetId: string,
  userId: string,
): Promise<void> {
  const sourceType = String(formData.get("homeLinkSourceType") ?? "");
  const sourceId = String(formData.get("homeLinkSourceId") ?? "");

  if (!SOURCE_TYPES.includes(sourceType as HomeLinkSourceType)) return;
  if (!UUID_RE.test(sourceId)) return;

  await createHomeLink({
    sourceType: sourceType as HomeLinkSourceType,
    sourceId,
    targetType,
    targetId,
    userId,
  });
}
