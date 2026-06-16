import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attachments, type Attachment } from "@/db/schema";
import type { AttachmentEntityType } from "./entity";

export type AttachmentSummary = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: Date;
};

export function attachmentUrl(id: string): string {
  return `/api/attachments/${id}`;
}

export function toAttachmentSummary(attachment: Attachment): AttachmentSummary {
  return {
    id: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    url: attachmentUrl(attachment.id),
    createdAt: attachment.createdAt,
  };
}

export async function listAttachmentsForEntity(
  entityType: AttachmentEntityType,
  entityId: string,
): Promise<AttachmentSummary[]> {
  const rows = await getDb()
    .select()
    .from(attachments)
    .where(and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)));

  return rows
    .map(toAttachmentSummary)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getAttachmentById(id: string): Promise<Attachment | undefined> {
  const [row] = await getDb().select().from(attachments).where(eq(attachments.id, id)).limit(1);
  return row;
}

export async function countAttachmentsForEntity(
  entityType: AttachmentEntityType,
  entityId: string,
): Promise<number> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(attachments)
    .where(and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)));

  return row?.value ?? 0;
}
