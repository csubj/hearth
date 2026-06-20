import { Suspense } from "react";
import { MaintenanceCreateForm } from "@/components/maintenance/MaintenanceCreateForm";
import { MaintenanceFilters } from "@/components/maintenance/MaintenanceFilters";
import { MaintenanceList } from "@/components/maintenance/MaintenanceList";
import {
  listMaintenanceCategories,
  listMaintenanceLogs,
  listMaintenanceTags,
} from "@/lib/actions/maintenance";
import { loadMentionUsers } from "@/lib/users/mention-users";

function parseFilters(searchParams: Record<string, string | string[] | undefined>) {
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : undefined;
  const tag = typeof searchParams.tag === "string" ? searchParams.tag.trim() : undefined;
  const category =
    typeof searchParams.category === "string" ? searchParams.category.trim() : undefined;
  const sort = typeof searchParams.sort === "string" ? searchParams.sort.trim() : undefined;
  return { q, tag, category, sort };
}

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const filters = parseFilters(resolvedSearchParams);
  const [items, tags, categories, mentionUsers] = await Promise.all([
    listMaintenanceLogs(resolvedSearchParams),
    listMaintenanceTags(),
    listMaintenanceCategories(),
    loadMentionUsers(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-text">Maintenance</h1>
        <p className="mt-1 text-sm text-text-muted">
          A log of maintenance and changes to your home — services, repairs, warranties, and
          follow-ups.
        </p>
      </header>

      <MaintenanceCreateForm users={mentionUsers} />

      <Suspense fallback={<p className="text-sm text-text-muted">Loading filters…</p>}>
        <MaintenanceFilters
          tags={tags}
          categories={categories}
          currentQ={filters.q}
          currentTag={filters.tag}
          currentCategory={filters.category}
          currentSort={filters.sort}
        />
      </Suspense>

      <MaintenanceList items={items} />
    </div>
  );
}
