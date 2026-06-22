import Link from "next/link";
import type { HomeSpaceWithChildren } from "@/lib/actions/home";

const SECTIONS = [
  { slug: "materials", label: "Materials" },
  { slug: "inventory", label: "Inventory" },
  { slug: "maintenance", label: "Maintenance" },
  { slug: "projects", label: "Projects" },
] as const;

function sectionCount(space: HomeSpaceWithChildren, slug: string): number {
  switch (slug) {
    case "materials":
      return space.items.length;
    case "inventory":
      return space.links.filter((l) => l.targetType === "inventory_item").length;
    case "maintenance":
      return space.links.filter((l) => l.targetType === "maintenance_log").length;
    case "projects":
      return space.links.filter((l) => l.targetType === "project").length;
    default:
      return 0;
  }
}

export function HomeSpaceSectionsNav({ space }: { space: HomeSpaceWithChildren }) {
  return (
    <nav
      aria-label="Space sections"
      className="rounded-lg border border-border bg-surface p-3 shadow-card"
    >
      <h2 className="text-sm font-medium text-text">Sections</h2>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {SECTIONS.map(({ slug, label }) => {
          const count = sectionCount(space, slug);
          return (
            <li key={slug}>
              <Link
                href={`/home-log/${space.id}/${slug}`}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm text-text transition-colors hover:bg-background"
              >
                <span>{label}</span>
                <span className="text-xs text-text-muted">{count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const HOME_LOG_SECTIONS = SECTIONS.map((s) => s.slug);

export type HomeLogSection = (typeof SECTIONS)[number]["slug"];
