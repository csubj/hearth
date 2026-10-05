import Link from "next/link";
import { serverClient } from "@/lib/orpc-server-client";

/**
 * "Needs you" Today section (task 13.4).
 *
 * Shows the member's open (unread) attention items, newest first.
 * Rendered on the server and streamed via Suspense.
 */
export async function TodayNeedsYou() {
  let items: Array<{
    id: string;
    reason: string;
    entityId: string;
    entityTitle: string;
    entityType: string;
    readAt: number | null;
  }> = [];

  try {
    const result = await serverClient.listInbox({ limit: 10 });
    items = (result as { data: typeof items }).data;
  } catch {
    items = [];
  }

  const unread = items.filter((i) => i.readAt === null);

  if (unread.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Nothing needs your attention right now. Mentions, assignments, and due
        reminders will appear here.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {unread.map((item) => (
        <li key={item.id}>
          <Link
            href={`/${item.entityType}/${item.entityId}`}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:bg-accent"
          >
            <span className="truncate font-medium">{item.entityTitle}</span>
            <span className="ml-3 shrink-0 text-xs text-muted-foreground">
              {item.reason}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
