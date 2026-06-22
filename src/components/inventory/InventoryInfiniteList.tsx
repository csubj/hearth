"use client";

import { useCallback } from "react";
import { InventoryItemCard } from "@/components/inventory/InventoryItemCard";
import { InfiniteList } from "@/components/ui/InfiniteList";
import { listInventoryItemsPage, type InventoryListItem } from "@/lib/actions/inventory";

export function InventoryInfiniteList({
  initialItems,
  initialNextOffset,
  searchParams,
}: {
  initialItems: InventoryListItem[];
  initialNextOffset: number | null;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const loadMore = useCallback(
    (offset: number) => listInventoryItemsPage(searchParams, offset),
    [searchParams],
  );

  return (
    <InfiniteList
      initialItems={initialItems}
      initialNextOffset={initialNextOffset}
      loadMore={loadMore}
      listClassName="space-y-2"
      renderItem={(item) => <InventoryItemCard item={item} />}
      emptyState={<p className="text-sm text-text-muted">No items match your filters.</p>}
    />
  );
}
