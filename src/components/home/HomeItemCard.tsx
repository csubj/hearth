import Link from "next/link";
import type { HomeItem } from "@/db/schema/home";
import { itemKindLabel } from "./format";

function ColorSwatch({ hex, name }: { hex: string; name: string | null }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="inline-block h-4 w-4 rounded-full border border-border shadow-sm"
        style={{ backgroundColor: hex }}
        aria-label={name ?? hex}
        title={name ?? hex}
      />
      {name && <span className="text-xs text-text-muted">{name}</span>}
      <span className="font-mono text-xs text-text-muted">{hex}</span>
    </span>
  );
}

export function HomeItemCard({ item }: { item: HomeItem }) {
  const kindLabel = itemKindLabel(item.kind);
  const meta = [item.manufacturer, item.modelNumber].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/home-log/items/${item.id}`}
      className="block rounded-md border border-border bg-background px-3 py-3 transition-colors hover:bg-surface"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-text">{item.name}</p>
          {meta && <p className="mt-0.5 truncate text-xs text-text-muted">{meta}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
          {kindLabel}
        </span>
      </div>
      {item.kind === "paint" && item.colorHex && (
        <div className="mt-2">
          <ColorSwatch hex={item.colorHex} name={item.colorName} />
        </div>
      )}
    </Link>
  );
}
