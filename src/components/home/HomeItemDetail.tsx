import Link from "next/link";
import { Suspense } from "react";
import type { HomeItemDetail } from "@/lib/actions/home";
import type { MentionUser } from "@/components/MentionTextarea";
import { listAttachmentsForEntity } from "@/lib/attachments/queries";
import { AttachmentsPanel } from "@/lib/attachments/AttachmentsPanel";
import { HomeItemMetadataForm } from "./HomeItemMetadataForm";
import { HomeItemNotesEditor } from "./HomeItemNotesEditor";
import { HomeItemDeleteButton } from "./HomeDeleteButton";
import { HomeRelatedPanel } from "./HomeRelatedPanel";
import { itemKindLabel } from "./format";

function ColorSwatchDetail({ hex, name }: { hex: string; name: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-10 w-10 rounded-md border border-border shadow-sm"
        style={{ backgroundColor: hex }}
        aria-label={name ?? hex}
      />
      <div>
        {name && <p className="text-sm font-medium text-text">{name}</p>}
        <p className="font-mono text-xs text-text-muted">{hex}</p>
      </div>
    </div>
  );
}

export async function HomeItemDetailView({
  item,
  users = [],
}: {
  item: HomeItemDetail;
  users?: MentionUser[];
}) {
  const attachments = await listAttachmentsForEntity("home_item", item.id);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <nav className="flex flex-wrap items-center gap-1 text-sm text-text-muted">
          <Link href="/home-log" className="transition-colors hover:text-text">
            Home Log
          </Link>
          <span aria-hidden="true">›</span>
          <Link href={`/home-log/${item.space.id}`} className="transition-colors hover:text-text">
            {item.space.name}
          </Link>
          <span aria-hidden="true">›</span>
          <span className="text-text">{item.name}</span>
        </nav>
        <h1 className="text-2xl font-bold text-text">{item.name}</h1>
        <p className="text-sm text-text-muted">{itemKindLabel(item.kind)}</p>
        {item.kind === "paint" && item.colorHex && (
          <ColorSwatchDetail hex={item.colorHex} name={item.colorName} />
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <HomeItemMetadataForm item={item} />
      </div>

      <HomeItemNotesEditor itemId={item.id} initialNotes={item.notes} users={users} />

      <HomeRelatedPanel sourceType="home_item" sourceId={item.id} links={item.links} />

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <Suspense fallback={<p className="text-sm text-text-muted">Loading files…</p>}>
          <AttachmentsPanel
            entityType="home_item"
            entityId={item.id}
            initialAttachments={attachments}
          />
        </Suspense>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <HomeItemDeleteButton itemId={item.id} />
      </section>
    </div>
  );
}
