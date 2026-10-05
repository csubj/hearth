"use client";

/**
 * Activity feed (tasks 10.1, 10.2 — design D12).
 *
 * Renders recent activity for an entity or the whole household, attributing
 * each entry as "<actor> via <key-name>" when the write came from an API key.
 * Undoable entries expose an Undo button that calls the `activityUndo`
 * procedure and refreshes.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { invoke } from "@/lib/actions/invoke";

interface ActivityItem {
  id: string;
  entityId: string;
  entityTitle: string;
  entityType: string;
  action: string;
  actorName: string;
  viaLabel: string | null;
  createdAt: number;
  undoable: boolean;
}

interface ActivityFeedProps {
  entityId?: string;
}

const ACTION_LABELS: Record<string, string> = {
  create: "created",
  update: "updated",
  tags: "changed tags on",
  assignees: "changed assignees on",
  link: "changed links on",
  archive: "archived",
  unarchive: "unarchived",
  delete: "deleted",
  restore: "restored",
  comment: "commented on",
  attach: "added an attachment to",
  "remove-attachment": "removed an attachment from",
  undo: "undid an action on",
  move: "moved",
};

/**
 * Stateless presentational row for one activity item. Exported so it can be
 * server-rendered in a unit test (task 10.1 acceptance: a write via the API
 * key "Claude" appears as "CJ via Claude").
 */
export function ActivityRow({
  item,
  onUndo,
  undoDisabled = false,
}: {
  item: ActivityItem;
  onUndo?: () => void;
  undoDisabled?: boolean;
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-md border bg-card p-3 text-sm"
      data-actor={item.actorName}
      data-via={item.viaLabel ?? ""}
    >
      <div className="min-w-0">
        <div className="truncate">
          <span className="font-medium">{item.actorName}</span>
          {item.viaLabel ? (
            <>
              {" "}
              <span className="text-muted-foreground">via</span>{" "}
              <span className="font-medium">{item.viaLabel}</span>
            </>
          ) : null}{" "}
          <span className="text-muted-foreground">
            {ACTION_LABELS[item.action] ?? item.action}
          </span>{" "}
          <span className="font-medium">{item.entityTitle}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {new Date(item.createdAt).toLocaleString()}
        </div>
      </div>
      {item.undoable ? (
        <Button
          variant="outline"
          size="sm"
          disabled={undoDisabled}
          onClick={onUndo}
          data-testid={`undo-${item.id}`}
        >
          Undo
        </Button>
      ) : null}
    </div>
  );
}

export function ActivityFeed({ entityId }: ActivityFeedProps) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, startUndo] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const [error, data] = await invoke("listActivity", {
      ...(entityId ? { entityId } : {}),
      limit: 50,
    });
    setLoading(false);
    if (!error && data) {
      setItems((data as { data: ActivityItem[] }).data);
    }
  }, [entityId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUndo = useCallback(
    (item: ActivityItem) => {
      startUndo(async () => {
        const [error] = await invoke("activityUndo", { id: item.id });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Undone.");
        load();
      });
    },
    [load],
  );

  if (!loading && items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">No activity yet.</div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ActivityRow
          key={item.id}
          item={item}
          undoDisabled={undoingId}
          onUndo={() => handleUndo(item)}
        />
      ))}
    </div>
  );
}
