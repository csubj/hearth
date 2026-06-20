import type { AttachmentEntityType } from "./entity";

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const ALLOWED_DOCUMENT_MIME_TYPES = ["application/pdf"] as const;

export const DOCUMENT_ENTITY_TYPES: readonly AttachmentEntityType[] = [
  "inventory_item",
  "project",
  "maintenance_log",
  "home_space",
  "home_item",
];

/** @deprecated Use ALLOWED_IMAGE_MIME_TYPES */
export const ALLOWED_MIME_TYPES = ALLOWED_IMAGE_MIME_TYPES;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];
export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];
export type AllowedMimeType = AllowedImageMimeType | AllowedDocumentMimeType;

export const MAX_ATTACHMENT_BYTES_IMAGE = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES_DOCUMENT = 25 * 1024 * 1024;

/** @deprecated Use getMaxBytesForEntity */
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_BYTES_IMAGE;

export const MAX_ATTACHMENTS_PER_ENTITY = 10;

export function allowsDocuments(entityType: AttachmentEntityType): boolean {
  return DOCUMENT_ENTITY_TYPES.includes(entityType);
}

export function getMaxBytesForEntity(entityType: AttachmentEntityType): number {
  return allowsDocuments(entityType) ? MAX_ATTACHMENT_BYTES_DOCUMENT : MAX_ATTACHMENT_BYTES_IMAGE;
}

export function getMaxBytesForMime(entityType: AttachmentEntityType, mimeType: string): number {
  if (allowsDocuments(entityType) && mimeType === "application/pdf") {
    return MAX_ATTACHMENT_BYTES_DOCUMENT;
  }
  return MAX_ATTACHMENT_BYTES_IMAGE;
}

export function isAllowedMimeForEntity(
  entityType: AttachmentEntityType,
  mimeType: string,
): mimeType is AllowedMimeType {
  if ((ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return true;
  }
  return (
    allowsDocuments(entityType) &&
    (ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)
  );
}

export function getUploadsDir(): string {
  return process.env.UPLOADS_DIR ?? "data/uploads";
}
