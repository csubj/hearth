"use client";

/**
 * Inbox page client (task 10.3, design D8).
 *
 * Lists open attention items for the current member, with mark-read,
 * mark-all-read and dismiss actions. Clicking an item marks it read and
 * navigates to its entity.
 */

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { invoke } from "@/lib/actions/invoke";

export interface InboxItem {
  id: string;
  reason: string;
  entityId: string;
  entityTitle: string;
  entityType: string;
  readAt: number | null;
  createdAt: number;
}

const REASON_LABELS: Record<string, string> = {
  mention: "mentioned you",
  assigned: "assigned you",
  reminder: "reminder",
};

export function InboxClient({ items: initial }: { items: InboxItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busyId, startBusy] = useTransition();

  const markAllRead = useCallback(() => {
    startBusy(async () => {
      const [error] = await invoke("inboxMarkAllRead", {});
      if (!error) {
        setItems((prev) =>
          prev.map((i) => (i.readAt === null ? { ...i, readAt: Date.now() } : i)),
        );
      }
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    startBusy(async () => {
      const [error] = await invoke("inboxDismiss", { id });
      if (!error) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    });
  }, []);

  const open = useCallback(
    (item: InboxItem) => {
      if (item.readAt === null) {
        startBusy(async () => {
          await invoke("inboxMarkRead", { id: item.id });
          router.push(`/${item.entityType}/${item.entityId}`);
        });
      } else {
        router.push(`/${item.entityType}/${item.entityId}`);
      }
    },
    [router],
  );

  const unread = items.filter((i) => i.readAt === null).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        {unread > 0 ? (
          <Button variant="outline" onClick={markAllRead} disabled={busyId}>
            Mark all read
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          You&apos;re all caught up.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-3 rounded-md border bg-card p-3 text-sm ${
                item.readAt === null ? "" : "opacity-70"
              }`}
            >
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => open(item)}
                data-testid={`inbox-item-${item.id}`}
              >
                <span className="font-medium">{item.entityTitle}</span>{" "}
                <span className="text-muted-foreground">
                  {REASON_LABELS[item.reason] ?? item.reason}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismiss(item.id)}
              >
                Dismiss
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
