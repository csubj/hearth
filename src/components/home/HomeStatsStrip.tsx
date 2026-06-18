import Link from "next/link";
import { getInventoryHomeStats } from "@/lib/actions/inventory";
import { getMetricsHomeStats } from "@/lib/actions/metrics";
import { getProjectsHomeStats } from "@/lib/actions/projects";
import { getRemindersHomeStats } from "@/lib/actions/reminders";
import { getRestaurantsHomeStats } from "@/lib/actions/restaurants";

type StatTile = {
  href: string;
  label: string;
  value: number;
  detail?: string;
  highlight?: boolean;
};

export async function HomeStatsStrip() {
  const [projects, restaurants, metrics, inventory, reminders] = await Promise.all([
    getProjectsHomeStats(),
    getRestaurantsHomeStats(),
    getMetricsHomeStats(),
    getInventoryHomeStats(),
    getRemindersHomeStats(),
  ]);

  const tiles: StatTile[] = [
    {
      href: "/projects",
      label: "Active projects",
      value: projects.active,
    },
    {
      href: "/restaurants",
      label: "Want to try",
      value: restaurants.wantToTry,
    },
    {
      href: "/metrics",
      label: "Stale metrics",
      value: metrics.stale,
      detail: metrics.total > 0 ? `${metrics.total} total` : undefined,
      highlight: metrics.stale > 0,
    },
    {
      href: "/inventory",
      label: "Items due",
      value: inventory.dueItems,
      detail: inventory.total > 0 ? `${inventory.total} items` : undefined,
      highlight: inventory.dueItems > 0,
    },
    {
      href: "/reminders",
      label: "Reminders",
      value: reminders.overdue + reminders.dueSoon,
      detail:
        reminders.overdue > 0
          ? `${reminders.overdue} overdue`
          : reminders.dueSoon > 0
            ? `${reminders.dueSoon} due soon`
            : undefined,
      highlight: reminders.overdue > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <Link
          key={tile.href}
          href={tile.href}
          className={`rounded-lg border px-3 py-2 transition-colors hover:bg-accent-soft/50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
            tile.highlight ? "border-accent/30 bg-accent-soft/20" : "border-border bg-surface"
          }`}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            {tile.label}
          </p>
          <p className="mt-0.5 font-serif text-xl text-text">{tile.value}</p>
          {tile.detail ? <p className="text-[11px] text-text-muted">{tile.detail}</p> : null}
        </Link>
      ))}
    </div>
  );
}
