"use client";

/**
 * "Pinned" Today section (task 13.4, design D8).
 *
 * Client component: loads the current member's pins via `invoke` and provides
 * an unpin action so pins can be removed from the Today page. Pins are
 * per-user.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { invoke } from "@/lib/actions/invoke";

interface PinnedItem {
  id: string;
  type: string;
  title: string;
  placeId: string | null;
}

export function TodayPinned() {
  const [items, setItems] = useState<PinnedItem[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const [, data] = await invoke("listPinned", {});
    setItems((data as { data: PinnedItem[] } | undefined)?.data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (items === null) {
    return (
      <div className="flex h-16 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
        Loading pins…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        You have not pinned anything. Pin an entity from its detail page to
        keep it here for quick access.
      </div>
    );
  }

  const unpin = (id: string) => {
    startTransition(async () => {
      await invoke("entityUnpin", { id });
      await load();
    });
  };

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm"
        >
          <Link href={`/${item.type}/${item.id}`} className="truncate font-medium hover:underline">
            {item.title}
          </Link>
          <div className="ml-3 flex shrink-0 items-center gap-3">
            <span className="text-xs text-muted-foreground">{item.type}</span>
            <button
              type="button"
              onClick={() => unpin(item.id)}
              disabled={isPending}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            >
              Unpin
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
