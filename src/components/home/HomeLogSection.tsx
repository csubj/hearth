import Link from "next/link";
import { getHomeLogHomeSummary, getHomeLogHomeStats } from "@/lib/actions/home";

export async function HomeLogSection() {
  const [properties, stats] = await Promise.all([getHomeLogHomeSummary(), getHomeLogHomeStats()]);

  return (
    <section className="rounded-lg border border-border bg-surface p-3 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-base text-text">Home Log</h2>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
            {stats.totalSpaces} spaces · {stats.totalItems} items
          </span>
        </div>
        <Link href="/home-log" className="text-xs text-accent hover:text-accent/80">
          View all
        </Link>
      </div>
      {properties.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {properties.slice(0, 4).map((space) => (
            <li key={space.id}>
              <Link
                href={`/home-log/${space.id}`}
                className="block rounded-md px-2 py-1 text-sm text-text transition-colors hover:bg-background"
              >
                {space.name}
                {space.address && (
                  <span className="ml-2 text-xs text-text-muted">{space.address}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-text-muted">
          No properties yet.{" "}
          <Link href="/home-log" className="text-accent hover:text-accent/80">
            Add one
          </Link>
        </p>
      )}
    </section>
  );
}
