import Link from "next/link";
import type { HomeTreeNode, HomeTreeItem } from "@/lib/actions/home";
import { spaceKindLabel, itemKindLabel } from "./format";

function countSpaces(node: HomeTreeNode): number {
  return node.children.reduce((n, child) => n + 1 + countSpaces(child), 0);
}

function countItems(node: HomeTreeNode): number {
  return node.items.length + node.children.reduce((n, child) => n + countItems(child), 0);
}

function CountMark({ children }: { children: React.ReactNode }) {
  return <span className="text-xs uppercase tracking-[0.1em] text-text-muted">{children}</span>;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`;
}

function ChevronIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <path d="M6 4l4 4-4 4V4z" />
    </svg>
  );
}

function ItemRow({ item }: { item: HomeTreeItem }) {
  return (
    <li>
      <Link
        href={`/inventory/${item.id}`}
        className="group/item flex items-center gap-2 space-x-0 py-1 text-sm text-text transition-colors hover:text-accent"
      >
        {item.colorHex ? (
          <span
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 rounded-[2px] border border-border/60"
            style={{ backgroundColor: item.colorHex }}
          />
        ) : null}
        <span className="min-w-0 truncate">{item.name}</span>
        <span className="ml-auto shrink-0 text-xs text-text-muted">
          {itemKindLabel(item.kind)}
        </span>
      </Link>
    </li>
  );
}

function LinkedMark({ node }: { node: HomeTreeNode }) {
  const counts: Array<{ group: "maintenance" | "projects"; label: string; count: number }> = [];
  if (node.maintenance.length > 0) {
    counts.push({
      group: "maintenance",
      label: "Maintenance",
      count: node.maintenance.length,
    });
  }
  if (node.projects.length > 0) {
    counts.push({ group: "projects", label: "Projects", count: node.projects.length });
  }
  if (counts.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3">
      {counts.map((c) => (
        <span key={c.group} className="text-xs uppercase tracking-[0.1em] text-text-muted">
          {c.count} {c.label}
        </span>
      ))}
    </div>
  );
}

function SpaceCell({ space }: { space: HomeTreeNode }) {
  return (
    <div className="rounded-sm border border-border p-3">
      <div className="flex items-baseline justify-between gap-3">
        <Link
          href={`/home-log/${space.id}`}
          className="font-serif text-base leading-snug text-text transition-colors hover:text-accent"
        >
          {space.name}
        </Link>
        <span className="shrink-0 text-xs uppercase tracking-[0.1em] text-text-muted">
          {spaceKindLabel(space.kind)}
        </span>
      </div>

      {space.items.length > 0 ? (
        <ul className="mt-2 border-t border-border">
          {space.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      ) : null}

      {space.children.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-border pt-2">
          {space.children.map((child) => (
            <li key={child.id}>
              <Link
                href={`/home-log/${child.id}`}
                className="flex items-center justify-between gap-3 text-sm text-text-muted transition-colors hover:text-accent"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="size-1 shrink-0 rounded-full bg-border" />
                  <span className="truncate">{child.name}</span>
                </span>
                <span className="shrink-0 text-xs uppercase tracking-[0.1em] text-text-muted">
                  {spaceKindLabel(child.kind)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <LinkedMark node={space} />
    </div>
  );
}

export function PropertyPlan({ property }: { property: HomeTreeNode }) {
  const hasChildren = property.children.length > 0;
  const hasItems = property.items.length > 0;

  return (
    <details open className="group border-t border-border pt-4">
      <summary
        className="flex cursor-pointer list-none items-baseline justify-between gap-4 [&::-webkit-details-marker]:hidden"
      >
        <div className="min-w-0">
          <h2 className="font-serif text-xl text-text">{property.name}</h2>
          <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-text-muted">
            {spaceKindLabel(property.kind)}
            {property.address ? ` · ${property.address}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <CountMark>
            {pluralize(countSpaces(property), "space", "spaces")} ·{" "}
            {pluralize(countItems(property), "item", "items")}
          </CountMark>
          <span className="text-text-muted transition-transform group-open:rotate-90" aria-hidden>
            <ChevronIcon />
          </span>
        </div>
      </summary>

      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {property.children.map((child) => (
            <SpaceCell key={child.id} space={child} />
          ))}
        </div>

        {!hasChildren && !hasItems ? (
          <p className="text-sm text-text-muted">
            No rooms or items yet.{" "}
            <Link href={`/home-log/${property.id}`} className="text-accent hover:text-accent/80">
              Open this property
            </Link>
            .
          </p>
        ) : null}

        {hasItems ? (
          <div className="border-t border-border pt-4">
            <h3 className="text-xs uppercase tracking-[0.14em] text-text-muted">
              On this property
            </h3>
            <ul className="mt-2">
              {property.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
          </div>
        ) : null}

        <LinkedMark node={property} />
      </div>
    </details>
  );
}
