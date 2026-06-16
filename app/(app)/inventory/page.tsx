import { Suspense } from "react";
import { CreateInventoryForm } from "@/components/inventory/CreateInventoryForm";
import { InventoryFilters } from "@/components/inventory/InventoryFilters";
import { InventoryList } from "@/components/inventory/InventoryList";
import {
  listInventoryItemTypes,
  listInventoryItems,
  listInventoryTags,
} from "@/lib/actions/inventory";

function parseFilters(searchParams: Record<string, string | string[] | undefined>) {
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : undefined;
  const tag = typeof searchParams.tag === "string" ? searchParams.tag.trim() : undefined;
  const type = typeof searchParams.type === "string" ? searchParams.type.trim() : undefined;
  return { q, tag, type };
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const filters = parseFilters(resolvedSearchParams);
  const [items, tags, itemTypes] = await Promise.all([
    listInventoryItems(resolvedSearchParams),
    listInventoryTags(),
    listInventoryItemTypes(),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-text">Inventory</h1>
          <p className="mt-1 text-sm text-text-muted">
            Household catalog — appliances, tools, manuals, and more.
          </p>
        </div>
        <CreateInventoryForm />
      </header>

      <Suspense fallback={<p className="text-sm text-text-muted">Loading filters…</p>}>
        <InventoryFilters
          tags={tags}
          itemTypes={itemTypes}
          currentQ={filters.q}
          currentTag={filters.tag}
          currentType={filters.type}
        />
      </Suspense>

      <InventoryList items={items} />
    </div>
  );
}
