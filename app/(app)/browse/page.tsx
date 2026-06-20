import Link from "next/link";
import { getInventoryHomeStats } from "@/lib/actions/inventory";
import { getMaintenanceHomeStats } from "@/lib/actions/maintenance";
import { getMetricsHomeStats } from "@/lib/actions/metrics";
import { getProjectsHomeStats } from "@/lib/actions/projects";
import { getRestaurantsHomeStats } from "@/lib/actions/restaurants";
import { getHomeLogHomeStats } from "@/lib/actions/home";

const browseAreas = [
  {
    href: "/projects",
    title: "Projects",
    description: "Track household projects, priorities, and costs.",
    statsKey: "projects" as const,
  },
  {
    href: "/restaurants",
    title: "Restaurants",
    description: "Save places to try and notes from visits.",
    statsKey: "restaurants" as const,
  },
  {
    href: "/metrics",
    title: "Metrics",
    description: "Log recurring measurements and spot stale entries.",
    statsKey: "metrics" as const,
  },
  {
    href: "/inventory",
    title: "Inventory",
    description: "Catalog items, warranties, and item upkeep schedules.",
    statsKey: "inventory" as const,
  },
  {
    href: "/maintenance",
    title: "Maintenance",
    description: "Log house maintenance, changes, costs, and follow-up reminders.",
    statsKey: "maintenance" as const,
  },
  {
    href: "/home-log",
    title: "Home Log",
    description: "Document properties, rooms, materials, colors, and equipment.",
    statsKey: "homeLog" as const,
  },
] as const;

function formatCount(
  statsKey: (typeof browseAreas)[number]["statsKey"],
  stats: Awaited<ReturnType<typeof loadBrowseStats>>,
): string {
  switch (statsKey) {
    case "projects":
      return `${stats.projects.active} active`;
    case "restaurants":
      return `${stats.restaurants.wantToTry} to try`;
    case "metrics":
      return `${stats.metrics.total} tracked`;
    case "inventory":
      return `${stats.inventory.total} items`;
    case "maintenance":
      return `${stats.maintenance.total} logs`;
    case "homeLog":
      return `${stats.homeLog.totalSpaces} spaces`;
  }
}

async function loadBrowseStats() {
  const [projects, restaurants, metrics, inventory, maintenance, homeLog] = await Promise.all([
    getProjectsHomeStats(),
    getRestaurantsHomeStats(),
    getMetricsHomeStats(),
    getInventoryHomeStats(),
    getMaintenanceHomeStats(),
    getHomeLogHomeStats(),
  ]);
  return { projects, restaurants, metrics, inventory, maintenance, homeLog };
}

export default async function BrowsePage() {
  const stats = await loadBrowseStats();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-text">Browse</h1>
        <p className="mt-1 text-sm text-text-muted">
          Jump into projects, restaurants, metrics, inventory, maintenance, and home log.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {browseAreas.map((area) => (
          <Link
            key={area.href}
            href={area.href}
            className="rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:bg-accent-soft/30 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-serif text-lg text-text">{area.title}</h2>
              <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                {formatCount(area.statsKey, stats)}
              </span>
            </div>
            <p className="mt-2 text-sm text-text-muted">{area.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
