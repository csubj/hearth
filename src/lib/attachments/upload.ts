import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attachments, users } from "@/db/schema";
import { emitHouseholdActivity } from "@/lib/notifications/emit";
import type { EntityType } from "@/lib/notifications/emit";
import {
  getMaxBytesForEntity,
  getMaxBytesForMime,
  isAllowedMimeForEntity,
  MAX_ATTACHMENTS_PER_ENTITY,
} from "./config";
import type { AttachmentEntityType } from "./entity";
import { entityExists } from "./entity";
import { detectFileMime, filenameExtensionMatchesDetected } from "./mime";
import { toAttachmentSummary } from "./queries";
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

export type DeleteAttachmentActor = {
  userId: string;
  isAdmin: boolean;
};

class AttachmentLimitError extends Error {
  constructor() {
    super("Attachment limit reached.");
    this.name = "AttachmentLimitError";
  }
}

function notificationTypeForEntity(entityType: AttachmentEntityType): string {
  switch (entityType) {
    case "restaurant":
      return "restaurant.updated";
    case "project":
      return "project.updated";
    case "metric_entry":
      return "metric.entry_added";
    case "inventory_item":
      return "inventory.updated";
    case "maintenance_log":
      return "maintenance.updated";
    case "home_space":
      return "home_log.space_updated";
    case "home_item":
      return "home_log.item_updated";
  }
}

async function actorDisplayName(userId: string): Promise<string> {
  const [user] = await getDb()
    .select({ displayName: users.displayName, username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user?.displayName ?? user?.username ?? "Someone";
}

export async function uploadAttachment(
  input: UploadAttachmentInput,
): Promise<UploadAttachmentResult> {
  if (!(await entityExists(input.entityType, input.entityId))) {
    return { ok: false, status: 404, error: "Entity not found." };
  }

  if (input.data.byteLength > getMaxBytesForEntity(input.entityType)) {
    const limitMb = Math.round(getMaxBytesForEntity(input.entityType) / (1024 * 1024));
    return { ok: false, status: 413, error: `File exceeds the ${limitMb} MB limit.` };
  }

  if (input.data.byteLength === 0) {
    return { ok: false, status: 400, error: "File is empty." };
  }

  const mimeResult = detectFileMime(input.data);
  if (!mimeResult.ok) {
    return { ok: false, status: 415, error: mimeResult.error };
  }

  if (!isAllowedMimeForEntity(input.entityType, mimeResult.mimeType)) {
    return {
      ok: false,
      status: 415,
      error:
        input.entityType === "inventory_item"
          ? "File type not allowed for inventory (images and PDF only)."
          : "Only image files are allowed for this item.",
    };
  }

  if (input.data.byteLength > getMaxBytesForMime(input.entityType, mimeResult.mimeType)) {
    const limitMb = Math.round(
      getMaxBytesForMime(input.entityType, mimeResult.mimeType) / (1024 * 1024),
    );
    return { ok: false, status: 413, error: `File exceeds the ${limitMb} MB limit.` };
  }

  if (!filenameExtensionMatchesDetected(input.filename, mimeResult.extension)) {
    return {
      ok: false,
      status: 415,
      error: "File extension does not match image content.",
    };
  }

  const id = crypto.randomUUID();
  const storagePath = `${id}.${mimeResult.extension}`;
  const now = new Date();
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
    await writeUploadFile(storagePath, input.data);
  } catch {
    return { ok: false, status: 500, error: "Failed to save file." };
  }

  try {
    getDb().transaction((tx) => {
      const countRow = tx
        .select({ value: count() })
        .from(attachments)
        .where(
          and(
            eq(attachments.entityType, input.entityType),
            eq(attachments.entityId, input.entityId),
          ),
        )
        .get();

      if ((countRow?.value ?? 0) >= MAX_ATTACHMENTS_PER_ENTITY) {
        throw new AttachmentLimitError();
      }

      tx.insert(attachments).values(row).run();
    });
  } catch (error) {
    await deleteUploadFile(storagePath);
    if (error instanceof AttachmentLimitError) {
      return {
        ok: false,
        status: 409,
        error: `Maximum of ${MAX_ATTACHMENTS_PER_ENTITY} files per item.`,
      };
    }
    return { ok: false, status: 500, error: "Failed to save attachment metadata." };
  }

  const name = await actorDisplayName(input.userId);
  const activityEntityType: EntityType = input.entityType;
  await emitHouseholdActivity({
    type: notificationTypeForEntity(input.entityType),
    actorId: input.userId,
    entityType: activityEntityType,
    entityId: input.entityId,
    summary: `${name} added a ${mimeResult.mimeType === "application/pdf" ? "document" : "photo"}`,
  });

  return { ok: true, attachment: toAttachmentSummary(row) };
}

export type DeleteAttachmentResult = { ok: true } | { ok: false; status: number; error: string };

export async function deleteAttachment(
  id: string,
  actor: DeleteAttachmentActor,
): Promise<DeleteAttachmentResult> {
  const attachment = await getDb()
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!attachment) {
    return { ok: false, status: 404, error: "Attachment not found." };
  }

  if (attachment.createdByUserId !== actor.userId && !actor.isAdmin) {
    return { ok: false, status: 403, error: "Not allowed to delete this attachment." };
  }

  await deleteUploadFile(attachment.storagePath);
  await getDb().delete(attachments).where(eq(attachments.id, id));

  return { ok: true };
}
