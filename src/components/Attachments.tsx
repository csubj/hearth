import type { EntityType } from "@/lib/notifications/emit";
import { attachmentEntityTypeFromEntityType } from "@/lib/attachments/entity";
import { listAttachmentsForEntity } from "@/lib/attachments/queries";
import { AttachmentsPanel } from "@/lib/attachments/AttachmentsPanel";

export interface AttachmentsProps {
  entityType: EntityType;
  entityId: string;
}

export async function Attachments({ entityType, entityId }: AttachmentsProps) {
  const attachmentEntityType = attachmentEntityTypeFromEntityType(entityType);
  if (!attachmentEntityType) {
    return null;
  }

  const items = await listAttachmentsForEntity(attachmentEntityType, entityId);

  return (
    <AttachmentsPanel
      entityType={attachmentEntityType}
      entityId={entityId}
      initialAttachments={items}
    />
  );
}
