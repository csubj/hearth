import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attachments } from "@/db/schema";
import { emitHouseholdActivity } from "@/lib/notifications/emit";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_ENTITY } from "./config";
import type { AttachmentEntityType } from "./entity";
import { entityExists } from "./entity";
import { detectImageMime } from "./mime";
import { countAttachmentsForEntity, toAttachmentSummary } from "./queries";
import { deleteUploadFile, writeUploadFile } from "./storage";

export type UploadAttachmentInput = {
  entityType: AttachmentEntityType;
  entityId: string;
  filename: string;
  data: Buffer;
  userId: string;
};

export type UploadAttachmentResult =
  | { ok: true; attachment: ReturnType<typeof toAttachmentSummary> }
  | { ok: false; status: number; error: string };

function notificationTypeForEntity(entityType: AttachmentEntityType): string {
  switch (entityType) {
    case "stream_entry":
      return "stream_entry.updated";
    case "restaurant":
      return "restaurant.updated";
    case "project":
      return "project.updated";
    case "tracker_entry":
      return "tracker_entry.updated";
    case "event":
      return "event.updated";
  }
}

export async function uploadAttachment(
  input: UploadAttachmentInput,
): Promise<UploadAttachmentResult> {
  if (!(await entityExists(input.entityType, input.entityId))) {
    return { ok: false, status: 404, error: "Entity not found." };
  }

  if (input.data.byteLength > MAX_ATTACHMENT_BYTES) {
    return { ok: false, status: 413, error: "File exceeds the 10 MB limit." };
  }

  if (input.data.byteLength === 0) {
    return { ok: false, status: 400, error: "File is empty." };
  }

  const mimeResult = detectImageMime(input.data);
  if (!mimeResult.ok) {
    return { ok: false, status: 415, error: mimeResult.error };
  }

  const existingCount = await countAttachmentsForEntity(input.entityType, input.entityId);
  if (existingCount >= MAX_ATTACHMENTS_PER_ENTITY) {
    return {
      ok: false,
      status: 409,
      error: `Maximum of ${MAX_ATTACHMENTS_PER_ENTITY} photos per item.`,
    };
  }

  const id = crypto.randomUUID();
  const storagePath = `${id}.${mimeResult.extension}`;
  const now = new Date();

  try {
    await writeUploadFile(storagePath, input.data);
  } catch {
    return { ok: false, status: 500, error: "Failed to save file." };
  }

  const row = {
    id,
    entityType: input.entityType,
    entityId: input.entityId,
    filename: input.filename || `${id}.${mimeResult.extension}`,
    mimeType: mimeResult.mimeType,
    sizeBytes: input.data.byteLength,
    storagePath,
    createdByUserId: input.userId,
    createdAt: now,
  };

  try {
    await getDb().insert(attachments).values(row);
  } catch {
    await deleteUploadFile(storagePath);
    return { ok: false, status: 500, error: "Failed to save attachment metadata." };
  }

  await emitHouseholdActivity({
    type: notificationTypeForEntity(input.entityType),
    actorId: input.userId,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: "Added a photo",
  });

  return { ok: true, attachment: toAttachmentSummary(row) };
}

export type DeleteAttachmentResult = { ok: true } | { ok: false; status: number; error: string };

export async function deleteAttachment(id: string): Promise<DeleteAttachmentResult> {
  const attachment = await getDb()
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!attachment) {
    return { ok: false, status: 404, error: "Attachment not found." };
  }

  await getDb().delete(attachments).where(eq(attachments.id, id));
  await deleteUploadFile(attachment.storagePath);

  return { ok: true };
}
