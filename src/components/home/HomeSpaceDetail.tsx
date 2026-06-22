import Link from "next/link";
import { Suspense } from "react";
import type { HomeSpaceWithChildren } from "@/lib/actions/home";
import type { MentionUser } from "@/components/MentionTextarea";
import { listAttachmentsForEntity } from "@/lib/attachments/queries";
import { AttachmentsPanel } from "@/lib/attachments/AttachmentsPanel";
import { HomeSpaceBreadcrumb } from "./HomeSpaceBreadcrumb";
import { HomeSpaceTitleForm } from "./HomeSpaceTitleForm";
import { HomeSpaceMetadataForm } from "./HomeSpaceMetadataForm";
import { HomeSpaceNotesEditor } from "./HomeSpaceNotesEditor";
import { HomeSpaceDeleteButton } from "./HomeDeleteButton";
import { HomeSpaceSectionsNav } from "./HomeSpaceSectionsNav";
import { spaceKindLabel } from "./format";

export async function HomeSpaceDetail({
  space,
  users = [],
  addSpaceTrigger,
}: {
  space: HomeSpaceWithChildren;
  users?: MentionUser[];
  addSpaceTrigger?: React.ReactNode;
}) {
  const attachments = await listAttachmentsForEntity("home_space", space.id);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <HomeSpaceBreadcrumb breadcrumb={space.breadcrumb.slice(0, -1)} />
        <HomeSpaceTitleForm spaceId={space.id} name={space.name} />
        <p className="text-sm text-text-muted">
          {spaceKindLabel(space.kind)}
          {space.address ? ` · ${space.address}` : ""}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <HomeSpaceMetadataForm space={space} />
        <div className="space-y-6">
          {/* Child spaces */}
          <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-text">Nested spaces</h2>
              {addSpaceTrigger}
            </div>
            {space.children.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {space.children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/home-log/${child.id}`}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 transition-colors hover:bg-background"
                    >
                      <span className="text-sm text-text">{child.name}</span>
                      <span className="text-xs text-text-muted">{spaceKindLabel(child.kind)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-text-muted">
                No nested spaces yet. Add a structure, room, or area inside this space.
              </p>
            )}
          </section>
        </div>
      </div>

      <HomeSpaceNotesEditor spaceId={space.id} initialNotes={space.notes} users={users} />

      <HomeSpaceSectionsNav space={space} />

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <Suspense fallback={<p className="text-sm text-text-muted">Loading files…</p>}>
          <AttachmentsPanel
            entityType="home_space"
            entityId={space.id}
            initialAttachments={attachments}
          />
        </Suspense>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <HomeSpaceDeleteButton spaceId={space.id} />
      </section>
    </div>
  );
}
