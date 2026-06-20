import Link from "next/link";
import type { HomeLinkTargetType } from "@/db/schema/home";
import type { HomeReferenceTarget } from "@/lib/actions/home";
import { listHomeReferencesForTarget } from "@/lib/actions/home";
import { spaceKindLabel, itemKindLabel } from "./format";
import type { HomeSpaceKind, HomeItemKind } from "@/db/schema/home";

function referenceHref(ref: HomeReferenceTarget): string {
  if (ref.sourceType === "home_space") {
    return `/home-log/${ref.sourceId}`;
  }
  return `/home-log/items/${ref.sourceId}`;
}

function referenceKindLabel(ref: HomeReferenceTarget): string {
  if (ref.sourceType === "home_space") {
    return spaceKindLabel(ref.sourceKind as HomeSpaceKind);
  }
  return itemKindLabel(ref.sourceKind as HomeItemKind);
}

export async function HomeReferencesPanel({
  targetType,
  targetId,
}: {
  targetType: HomeLinkTargetType;
  targetId: string;
}) {
  const references = await listHomeReferencesForTarget(targetType, targetId);

  if (references.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium text-text">Referenced from Home Log</h2>
      <ul className="mt-3 space-y-2">
        {references.map((ref) => (
          <li
            key={`${ref.sourceType}-${ref.sourceId}`}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
          >
            <Link href={referenceHref(ref)} className="text-sm text-accent">
              {ref.sourceName}
            </Link>
            <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
              {referenceKindLabel(ref)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
