import { validateRequest } from "@/lib/auth/session";
import { getPreviousLastSeenAt, listSinceLastVisit } from "@/lib/notifications/queries";
import { SinceLastVisitList } from "@/components/notifications/NotificationList";

export async function SinceLastVisitSection() {
  const { user } = await validateRequest();
  if (!user) {
    return null;
  }

  let items: Awaited<ReturnType<typeof listSinceLastVisit>> = [];

  try {
    items = await listSinceLastVisit(user.id, await getPreviousLastSeenAt(user.id));
  } catch {
    items = [];
  }

  return <SinceLastVisitList items={items} />;
}
