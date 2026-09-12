import Link from "next/link";
import { notFound } from "next/navigation";
import { getHomeSpaceById, listAllHomeSpaces } from "@/lib/actions/home";
import { CreateDialog } from "@/components/ui/CreateDialog";
import type { HomeSpaceInventoryItem } from "@/lib/actions/home";
import { decorativeInventoryKinds } from "@/db/schema/inventory";
import { HomeRelatedPanel } from "@/components/home/HomeRelatedPanel";
import { HOME_LOG_SECTIONS, type HomeLogSection } from "@/components/home/HomeSpaceSectionsNav";
import { ProjectCreateForm } from "@/components/projects/ProjectCreateForm";
import { MaintenanceCreateForm } from "@/components/maintenance/MaintenanceCreateForm";
import { InventoryCreateForm } from "@/components/inventory/CreateInventoryForm";
import { itemKindLabel } from "@/components/home/format";
import type { InventoryItemKind } from "@/db/schema/inventory";
import type { HomeLinkTargetType } from "@/db/schema/home";
import { loadMentionUsers } from "@/lib/users/mention-users";

const SECTION_LABELS: Record<HomeLogSection, string> = {
  materials: "Materials & equipment",
  inventory: "Inventory",
  maintenance: "Maintenance",
  projects: "Projects",
};

const SECTION_TARGET: Record<
  Exclude<HomeLogSection, "materials" | "inventory">,
  HomeLinkTargetType
> = {
  maintenance: "maintenance_log",
  projects: "project",
};

function isHomeLogSection(value: string): value is HomeLogSection {
  return (HOME_LOG_SECTIONS as readonly string[]).includes(value);
}

function InventoryItemRow({ item }: { item: HomeSpaceInventoryItem }) {
  return (
    <li>
      <Link
        href={`/inventory/${item.id}`}
        className="flex items-center justify-between rounded-md border border-border px-3 py-2 transition-colors hover:bg-background"
      >
        <span className="text-sm text-text">{item.name}</span>
        <span className="text-xs text-text-muted">{itemKindLabel(item.kind)}</span>
      </Link>
    </li>
  );
}

function InventoryList({ items }: { items: HomeSpaceInventoryItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">No items assigned to this space.</p>;
  }

  const groups = new Map<string, HomeSpaceInventoryItem[]>();
  for (const item of items) {
    const key = item.kind ?? "uncategorized";
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([kind, list]) => (
        <section key={kind}>
          <h2 className="text-sm font-medium text-text">
            {kind === "uncategorized" ? "Uncategorized" : itemKindLabel(kind as InventoryItemKind)}
          </h2>
          <ul className="mt-2 space-y-2">
            {list.map((item) => (
              <InventoryItemRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default async function HomeSpaceSectionPage({
  params,
}: {
  params: Promise<{ id: string; section: string }>;
}) {
  const { id, section } = await params;

  if (!isHomeLogSection(section)) {
    notFound();
  }

  const [space, spaces] = await Promise.all([getHomeSpaceById(id), listAllHomeSpaces()]);
  if (!space) {
    notFound();
  }

  const mentionUsers =
    section === "maintenance" || section === "projects" ? await loadMentionUsers() : [];

  const decorateItems =
    section === "materials"
      ? space.items.filter((item) => item.kind && decorativeInventoryKinds.includes(item.kind))
      : space.items;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-text">{SECTION_LABELS[section]}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {space.name} ·{" "}
            <Link href={`/home-log/${space.id}`} className="text-accent hover:underline">
              Back to space
            </Link>
          </p>
        </div>
        {section === "materials" ? (
          <CreateDialog
            triggerLabel="Add item"
            title="Add an item"
            description={`Add a material or piece of equipment to ${space.name}.`}
          >
            <InventoryCreateForm spaces={spaces} initialSpaceId={space.id} />
          </CreateDialog>
        ) : section === "inventory" ? (
          <CreateDialog
            triggerLabel="New inventory item"
            title="New inventory item"
            description={`Create an inventory item and assign it to ${space.name}.`}
          >
            <InventoryCreateForm spaces={spaces} initialSpaceId={space.id} />
          </CreateDialog>
        ) : section === "maintenance" ? (
          <CreateDialog
            triggerLabel="Log maintenance"
            title="Log maintenance"
            description={`Record maintenance and link it to ${space.name}.`}
          >
            <MaintenanceCreateForm
              users={mentionUsers}
              homeLinkSourceType="home_space"
              homeLinkSourceId={space.id}
            />
          </CreateDialog>
        ) : (
          <CreateDialog
            triggerLabel="New project"
            title="New project"
            description={`Create a project and link it to ${space.name}.`}
          >
            <ProjectCreateForm
              users={mentionUsers}
              homeLinkSourceType="home_space"
              homeLinkSourceId={space.id}
            />
          </CreateDialog>
        )}
      </header>

      {section === "materials" || section === "inventory" ? (
        <InventoryList items={decorateItems} />
      ) : (
        <HomeRelatedPanel
          sourceType="home_space"
          sourceId={space.id}
          links={space.links}
          only={SECTION_TARGET[section]}
        />
      )}
    </div>
  );
}
