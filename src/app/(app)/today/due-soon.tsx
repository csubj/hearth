import Link from "next/link";
import { serverClient } from "@/lib/orpc-server-client";

/**
 * "Due soon" Today section (task 13.4, design D14).
 *
 * Uses the personal due feed (remindersDueFeed): the current member's resolved
 * reminders due within 14 days, overdue first. Rendered on the server and
 * streamed via Suspense.
 */
export async function TodayDueSoon() {
  let items: Array<{
    id: string;
    title: string;
    dueOn: string;
    entityId: string;
    entityTitle: string;
    entityType: string;
  }> = [];

  try {
    const result = await serverClient.remindersDueFeed({});
    items = (result as { data: typeof items }).data;
  } catch {
    items = [];
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        No reminders are due soon. Reminders on entities will show here when
        they are due within the next two weeks.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/${item.entityType}/${item.entityId}`}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:bg-accent"
          >
            <span className="truncate font-medium">{item.title}</span>
            <span className="ml-3 shrink-0 text-xs text-muted-foreground">
              {formatDue(item.dueOn)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function formatDue(dueOn: string): string {
  return dueOn;
}
