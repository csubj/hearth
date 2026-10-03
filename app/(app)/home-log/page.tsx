import { getHomeLogHomeStats, getHomeTree } from "@/lib/actions/home";
import { PropertyPlan } from "@/components/home/HomeLogPropertyPlan";
import { CreateDialog } from "@/components/ui/CreateDialog";
import { HomeSpaceCreateForm } from "@/components/home/HomeSpaceCreateForm";

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`;
}

export default async function HomeLogPage() {
  const [tree, stats] = await Promise.all([getHomeTree(), getHomeLogHomeStats()]);
  const propertyCount = tree.length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl text-text">Home Log</h1>
          <p className="mt-1 max-w-[58ch] text-sm text-text-muted">
            The household&apos;s record of properties, spaces, materials, and equipment. Expand a
            property to see its rooms and how it connects to maintenance, inventory, and projects.
          </p>
          <p className="mt-3 text-xs uppercase tracking-[0.1em] text-text-muted">
            {pluralize(propertyCount, "property", "properties")} ·
            {` ${pluralize(stats.totalSpaces, "space", "spaces")} ·`}{" "}
            {pluralize(stats.totalItems, "item", "items")}
          </p>
        </div>
        {propertyCount > 0 ? (
          <CreateDialog
            triggerLabel="Add property"
            title="Add a property"
            description="Start a new property to organize its rooms, materials, and equipment."
          >
            <HomeSpaceCreateForm defaultKind="property" />
          </CreateDialog>
        ) : null}
      </header>

      {tree.length > 0 ? (
        <div>
          {tree.map((property) => (
            <PropertyPlan key={property.id} property={property} />
          ))}
        </div>
      ) : (
        <div className="rounded-sm border border-border p-8 text-center">
          <h2 className="font-serif text-xl text-text">No properties yet</h2>
          <p className="mx-auto mt-2 max-w-[40ch] text-sm text-text-muted">
            Start with a property — a home, a cabin, or a rental — then add the rooms,
            materials, and equipment that belong to it.
          </p>
          <div className="mt-4 flex justify-center">
            <CreateDialog
              triggerLabel="Add a property"
              title="Add a property"
              description="Start a new property to organize its rooms, materials, and equipment."
            >
              <HomeSpaceCreateForm defaultKind="property" />
            </CreateDialog>
          </div>
        </div>
      )}
    </div>
  );
}
