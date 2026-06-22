import { Suspense } from "react";
import { CreateDialog } from "@/components/ui/CreateDialog";
import { ProjectCreateForm } from "@/components/projects/ProjectCreateForm";
import { ProjectFilters } from "@/components/projects/ProjectFilters";
import { ProjectInfiniteList } from "@/components/projects/ProjectInfiniteList";
import { listProjectTags, listProjectsPage } from "@/lib/actions/projects";
import { loadMentionUsers } from "@/lib/users/mention-users";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const [page, tags, mentionUsers] = await Promise.all([
    listProjectsPage(resolvedSearchParams),
    listProjectTags(),
    loadMentionUsers(),
  ]);

  const currentQ = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : undefined;
  const currentTag =
    typeof resolvedSearchParams.tag === "string" ? resolvedSearchParams.tag : undefined;
  const currentSort =
    typeof resolvedSearchParams.sort === "string" ? resolvedSearchParams.sort : undefined;
  const currentStatus =
    typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : undefined;
  const listKey = JSON.stringify(resolvedSearchParams);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-text">Projects</h1>
          <p className="mt-1 text-sm text-text-muted">
            House projects — notes, costs, and files in one place.
          </p>
        </div>
        <CreateDialog
          triggerLabel="New project"
          title="New project"
          description="Capture a house project — notes, costs, and files in one place."
        >
          <ProjectCreateForm users={mentionUsers} />
        </CreateDialog>
      </header>

      <Suspense fallback={<p className="text-sm text-text-muted">Loading filters…</p>}>
        <ProjectFilters
          tags={tags}
          currentQ={currentQ}
          currentTag={currentTag}
          currentSort={currentSort}
          currentStatus={currentStatus}
        />
      </Suspense>

      <ProjectInfiniteList
        key={listKey}
        initialItems={page.items}
        initialNextOffset={page.nextOffset}
        searchParams={resolvedSearchParams}
      />
    </div>
  );
}
