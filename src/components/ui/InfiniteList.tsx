"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import type { ListPage } from "@/lib/pagination/list";

type InfiniteListProps<T extends { id: string }> = {
  initialItems: T[];
  initialNextOffset: number | null;
  loadMore: (offset: number) => Promise<ListPage<T>>;
  renderItem: (item: T) => ReactNode;
  emptyState?: ReactNode;
  listClassName?: string;
};

export function InfiniteList<T extends { id: string }>({
  initialItems,
  initialNextOffset,
  loadMore,
  renderItem,
  emptyState,
  listClassName = "space-y-3",
}: InfiniteListProps<T>) {
  const [items, setItems] = useState<T[]>(initialItems);
  const [nextOffset, setNextOffset] = useState<number | null>(initialNextOffset);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleLoadMore = useCallback(() => {
    if (nextOffset === null) {
      return;
    }
    const offset = nextOffset;
    startTransition(async () => {
      try {
        const page = await loadMore(offset);
        setItems((current) => {
          const seen = new Set(current.map((item) => item.id));
          const merged = [...current];
          for (const item of page.items) {
            if (!seen.has(item.id)) {
              merged.push(item);
            }
          }
          return merged;
        });
        setNextOffset(page.nextOffset);
        setError(null);
      } catch {
        setError("Couldn't load more items. Try again.");
      }
    });
  }, [loadMore, nextOffset]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || nextOffset === null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          handleLoadMore();
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleLoadMore, nextOffset]);

  if (items.length === 0) {
    return (
      <>
        {emptyState ?? (
          <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-text-muted">
            Nothing here yet.
          </p>
        )}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <ul className={listClassName}>
        {items.map((item) => (
          <li key={item.id}>{renderItem(item)}</li>
        ))}
      </ul>

      {nextOffset !== null ? (
        <div ref={sentinelRef} className="py-2 text-center">
          {isPending ? <span className="text-xs text-text-muted">Loading…</span> : null}
          {error ? (
            <button
              type="button"
              onClick={handleLoadMore}
              className="text-sm font-medium text-accent hover:text-accent/80"
            >
              {error} Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
