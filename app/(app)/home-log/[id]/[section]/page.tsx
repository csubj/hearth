import Link from "next/link";
import { notFound } from "next/navigation";
import { getHomeSpaceById } from "@/lib/actions/home";
import { CreateDialog } from "@/components/ui/CreateDialog";
import { HomeItemCard } from "@/components/home/HomeItemCard";
import { HomeItemCreateForm } from "@/components/home/HomeItemCreateForm";
import { HomeRelatedPanel } from "@/components/home/HomeRelatedPanel";
import { HOME_LOG_SECTIONS, type HomeLogSection } from "@/components/home/HomeSpaceSectionsNav";
import { ProjectCreateForm } from "@/components/projects/ProjectCreateForm";
import { MaintenanceCreateForm } from "@/components/maintenance/MaintenanceCreateForm";
import { InventoryCreateForm } from "@/components/inventory/CreateInventoryForm";
import type { HomeLinkTargetType } from "@/db/schema/home";
import { loadMentionUsers } from "@/lib/users/mention-users";

const SECTION_LABELS: Record<HomeLogSection, string> = {
  materials: "Materials & equipment",
  inventory: "Inventory",
  maintenance: "Maintenance",
  projects: "Projects",
};

const SECTION_TARGET: Record<Exclude<HomeLogSection, "materials">, HomeLinkTargetType> = {
  inventory: "inventory_item",
  maintenance: "maintenance_log",
  projects: "project",
};

function isHomeLogSection(value: string): value is HomeLogSection {
  return (HOME_LOG_SECTIONS as readonly string[]).includes(value);
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

  const space = await getHomeSpaceById(id);
  if (!space) {
    notFound();
  }

  const mentionUsers =
    section === "maintenance" || section === "projects" ? await loadMentionUsers() : [];

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
            <HomeItemCreateForm spaceId={space.id} />
          </CreateDialog>
        ) : section === "inventory" ? (
          <CreateDialog
            triggerLabel="New inventory item"
            title="New inventory item"
            description={`Create an inventory item and link it to ${space.name}.`}
          >
            <InventoryCreateForm homeLinkSourceType="home_space" homeLinkSourceId={space.id} />
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

      {section === "materials" ? (
        <section className="space-y-4">
          {space.items.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {space.items.map((item) => (
                <HomeItemCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              No items yet — use Add item to add paint colors, appliances, or other equipment.
            </p>
          )}
        </section>
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
