import Link from "next/link";
import type { InventoryListItem } from "@/lib/actions/inventory";

function formatUpdatedAt(date: Date): string {
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function InventoryList({ items }: { items: InventoryListItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">No items match your filters.</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/inventory/${item.id}`}
            className="block rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:bg-accent-soft/30 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-medium text-text">{item.name}</h2>
                <p className="mt-0.5 text-sm text-text-muted">
                  {[item.brand, item.model].filter(Boolean).join(" · ") || "No model info"}
                  {item.location ? ` · ${item.location}` : ""}
                </p>
              </div>
              <span className="text-xs text-text-muted">Updated {formatUpdatedAt(item.updatedAt)}</span>
            </div>
            {item.tags.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <li
                    key={tag.id}
                    className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-text-muted"
                  >
                    {tag.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
