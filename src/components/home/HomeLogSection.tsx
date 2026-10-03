import Link from "next/link";
import { getHomeLogHomeSummary, getHomeLogHomeStats } from "@/lib/actions/home";

export async function HomeLogSection() {
  const [properties, stats] = await Promise.all([getHomeLogHomeSummary(), getHomeLogHomeStats()]);

  return (
    <section className="border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-lg text-text">Home Log</h2>
          <span className="text-xs uppercase tracking-[0.1em] text-accent">
            {stats.totalSpaces} spaces · {stats.totalItems} items
          </span>
        </div>
        <Link href="/home-log" className="text-xs uppercase tracking-[0.1em] text-accent hover:text-accent/80">
          View all
        </Link>
      </div>
      {properties.length > 0 ? (
        <ul className="mt-3">
          {properties.slice(0, 4).map((space) => (
            <li key={space.id}>
              <Link
                href={`/home-log/${space.id}`}
                className="block border-b border-border py-1 text-sm text-text transition-colors hover:text-accent"
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
