import { Suspense } from "react";
import Link from "next/link";
import type { InventoryDetail } from "@/lib/actions/inventory";
import type { MentionUser } from "@/components/MentionTextarea";
import { listAttachmentsForEntity } from "@/lib/attachments/queries";
import { AttachmentsPanel } from "@/lib/attachments/AttachmentsPanel";
import { InventoryLinksPanel, InventoryTagsForm } from "@/components/inventory/InventoryLinksTags";
import { MaintenanceRemindersPanel } from "@/components/inventory/MaintenanceRemindersPanel";
import { UpdateInventoryForm } from "@/components/inventory/UpdateInventoryForm";
import { HomeReferencesPanel } from "@/components/home/HomeReferencesPanel";

function formatDate(date: Date | null): string | null {
  if (!date) {
    return null;
  }
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export async function InventoryDetailView({
  item,
  users = [],
}: {
  item: InventoryDetail;
  users?: MentionUser[];
}) {
  const attachments = await listAttachmentsForEntity("inventory_item", item.id);
  const subtitle = [item.brand, item.model, item.location].filter(Boolean).join(" · ");
  const purchaseLabel = formatDate(item.purchaseDate);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/inventory"
          className="text-sm text-text-muted transition-colors hover:text-text"
        >
          ← Back to inventory
        </Link>
        <h1 className="mt-4 font-serif text-2xl text-text">{item.name}</h1>
        {subtitle ? <p className="mt-1 text-sm text-text-muted">{subtitle}</p> : null}
        {item.serial ? <p className="mt-1 text-sm text-text-muted">Serial: {item.serial}</p> : null}
        {purchaseLabel || item.store || item.price ? (
          <p className="mt-2 text-sm text-text-muted">
            {[purchaseLabel && `Purchased ${purchaseLabel}`, item.store, item.price]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        {item.warrantyNote ? (
          <p className="mt-2 text-sm text-text-muted">Warranty: {item.warrantyNote}</p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <UpdateInventoryForm item={item} users={users} />
        <div className="space-y-6">
          <InventoryTagsForm item={item} />
          <InventoryLinksPanel item={item} />
        </div>
      </div>

      <MaintenanceRemindersPanel
        inventoryItemId={item.id}
        reminders={item.maintenanceReminders}
        users={users}
      />

      <HomeReferencesPanel targetType="inventory_item" targetId={item.id} />

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <Suspense fallback={<p className="text-sm text-text-muted">Loading files…</p>}>
          <AttachmentsPanel
            entityType="inventory_item"
            entityId={item.id}
            initialAttachments={attachments}
          />
        </Suspense>
      </section>
    </div>
  );
}
