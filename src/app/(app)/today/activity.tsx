import Link from "next/link";
import { serverClient } from "@/lib/orpc-server-client";

/**
 * "Recent activity" Today section (task 13.4).
 *
 * Shows the most recent activity entries across all entities, compact.
 * Rendered on the server and streamed via Suspense.
 */
export async function TodayActivity() {
  let entries: Array<{
    id: string;
    action: string;
    entityId: string;
    entityTitle: string;
    entityType: string;
    actorName: string;
    viaLabel: string | null;
    createdAt: number;
  }> = [];

  try {
    const result = await serverClient.listActivity({ limit: 12 });
    entries = (result as { data: typeof entries }).data;
  } catch {
    entries = [];
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        No activity yet. Actions across the household will show here.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            href={`/${entry.entityType}/${entry.entityId}`}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:bg-accent"
          >
            <span className="truncate">
              <span className="font-medium">{entry.actorName}</span>{" "}
              <span className="text-muted-foreground">
                {actionLabel(entry.action)}
              </span>{" "}
              <span className="font-medium">{entry.entityTitle}</span>
            </span>
            <span className="ml-3 shrink-0 text-xs text-muted-foreground">
              {formatTime(entry.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function actionLabel(action: string): string {
  switch (action) {
    case "create":
      return "created";
    case "update":
      return "updated";
    case "archive":
      return "archived";
    case "delete":
      return "deleted";
    case "restore":
      return "restored";
    case "tags":
      return "tagged";
    case "assignees":
      return "assigned";
    case "comment":
      return "commented on";
    case "reminder-complete":
      return "completed a reminder on";
    default:
      return action;
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}
