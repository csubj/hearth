import Link from "next/link";
import { getHomeRoots } from "@/lib/actions/home";
import { HomeSpaceCreateForm } from "@/components/home/HomeSpaceCreateForm";
import { spaceKindLabel } from "@/components/home/format";

export default async function HomeLogPage() {
  const properties = await getHomeRoots();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-text">Home Log</h1>
        <p className="mt-1 text-sm text-text-muted">
          A reference for your properties — rooms, materials, equipment, and how everything connects
          to maintenance, inventory, and projects.
        </p>
      </header>

      <HomeSpaceCreateForm defaultKind="property" />

      {properties.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text">Properties</h2>
          <ul className="space-y-2">
            {properties.map((space) => (
              <li key={space.id}>
                <Link
                  href={`/home-log/${space.id}`}
                  className="flex items-start justify-between rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:bg-background"
                >
                  <div>
                    <p className="font-medium text-text">{space.name}</p>
                    {space.address && (
                      <p className="mt-0.5 text-sm text-text-muted">{space.address}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                    {spaceKindLabel(space.kind)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-text-muted">
          No properties yet. Add one above — you can nest structures, rooms, and areas inside each
          property.
        </p>
      )}
    </div>
  );
}
