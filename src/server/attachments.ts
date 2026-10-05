/**
 * Attachments (design D15, task 8.4).
 *
 * One upload path reused by the REST multipart route and the web session route.
 *
 *   - Content type is sniffed from bytes, not the filename.
 *   - Size limits are enforced before the file is stored, and at the HTTP
 *     layer before the body is read (see the routes).
 *   - prepare writes a temp file, verifies type/size, and (for images) makes a
 *     480px WebP thumbnail with sharp when available; fn inserts the row;
 *     afterCommit renames the temp files into place.
 *   - A failed transaction deletes the temp files.
 *   - Serving streams from disk with immutable caching and nosniff.
 *   - Removal is a soft delete (deleted_at), restorable for 30 days; the daily
 *     sweep purges old rows / orphan files / temp files.
 */

import "server-only";

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ORPCError } from "@orpc/server";

import { ERROR_STATUS_MAP } from "./orpc";
import { writeWithDb, type WriteContext } from "./write";
import { assertEntityFeature, isFeatureEnabledOn } from "./entity-feature";
import { getModule } from "../modules/registry";
import { db } from "../db";
import { attachments } from "../db/schema";

// ---------------------------------------------------------------------------
// Limits and types (design D15)
// ---------------------------------------------------------------------------

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const PDF_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
export const PDF_MIME = "application/pdf";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

// ---------------------------------------------------------------------------
// Storage layout
// ---------------------------------------------------------------------------

/** The uploads root directory (override via UPLOADS_DIR). */
export function uploadsDir(): string {
  return (
    process.env.UPLOADS_DIR ?? join(process.cwd(), "data", "uploads")
  );
}

/** The temp directory used during upload. */
export function uploadsTmpDir(): string {
  return join(uploadsDir(), "tmp");
}

// ---------------------------------------------------------------------------
// Content sniffing (magic bytes — no external dependency)
// ---------------------------------------------------------------------------

/**
 * Determine the MIME type from file content rather than name/extension.
 * Returns null when the bytes do not match a supported type.
 */
export function sniffMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  // GIF: "GIF87a" or "GIF89a"
  const head = buffer.subarray(0, 6).toString("ascii");
  if (head === "GIF87a" || head === "GIF89a") {
    return "image/gif";
  }
  // WebP: "RIFF" ... "WEBP"
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  // PDF: "%PDF-"
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  return null;
}

/** Independent check to validate the sniffed type is one we accept. */
export function isSupportedMime(mime: string): boolean {
  return mime === PDF_MIME || IMAGE_MIMES.has(mime);
}

// ---------------------------------------------------------------------------
// Document-per-module gating (D15)
// ---------------------------------------------------------------------------

/**
 * Whether the module owning `entityType` allows PDF documents, i.e. its
 * `attachments` feature is `{ documents: true }`.
 */
export function moduleAllowsDocuments(entityType: string): boolean {
  const mod = getModule(entityType);
  if (!mod) return false;
  const att = mod.definition.features.attachments;
  if (typeof att === "object" && att !== null) {
    return att.documents === true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Validation helpers (used by prepare and by routes before reading)
// ---------------------------------------------------------------------------

/** Throws a validation_error for a spoofed / unsupported / oversized file. */
export function validateUpload(buffer: Buffer, mime: string, documentsAllowed: boolean): void {
  if (!isSupportedMime(mime)) {
    throw new ORPCError("validation_error", {
      status: ERROR_STATUS_MAP.validation_error,
      message: "Unsupported file type.",
      data: {
        details: [
          { path: "file", message: "Only JPEG, PNG, WebP, GIF and PDF are supported." },
        ],
      },
    });
  }

  const size = buffer.length;
  if (mime === PDF_MIME) {
    if (!documentsAllowed) {
      throw new ORPCError("forbidden", {
        status: ERROR_STATUS_MAP.forbidden,
        message: "This module does not allow document attachments.",
      });
    }
    if (size > PDF_MAX_BYTES) {
      throw new ORPCError("validation_error", {
        status: ERROR_STATUS_MAP.validation_error,
        message: "PDF exceeds the 25 MB limit.",
        data: {
          details: [{ path: "file", message: "PDF must be 25 MB or smaller." }],
        },
      });
    }
  } else if (size > IMAGE_MAX_BYTES) {
    throw new ORPCError("validation_error", {
      status: ERROR_STATUS_MAP.validation_error,
      message: "Image exceeds the 10 MB limit.",
      data: {
        details: [{ path: "file", message: "Image must be 10 MB or smaller." }],
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Upload (write pipeline: prepare → fn → afterCommit)
// ---------------------------------------------------------------------------

export interface UploadedAttachment {
  id: string;
  entityId: string;
  filename: string;
  mime: string;
  size: number;
  hasThumb: boolean;
}

/**
 * Upload an attachment to `entityId` using the write pipeline.
 *
 * This is the single implementation reused by the REST multipart route and the
 * web session route. It verifies the entity + feature, validates the file
 * (type from content, size), writes a temp file in prepare, inserts the row in
 * fn, and renames the temp file into place in afterCommit. A failed
 * transaction deletes the temp files.
 */
export async function uploadAttachment(
  ctx: WriteContext,
  entityId: string,
  file: { name: string; bytes: Buffer },
): Promise<UploadedAttachment> {
  const { name, bytes } = file;
  const filename = name || "upload";
  const size = bytes.length;
  const id = randomUUID();

  const tmpDir = uploadsTmpDir();
  const tmpPath = join(tmpDir, id);
  const tmpThumbPath = join(tmpDir, `${id}.thumb.webp`);

  // Feature/policy checks that must happen before any file is written.
  const entity = assertEntityFeature(entityId, "attachments");
  const documentsAllowed = moduleAllowsDocuments(entity.type as string);

  let meta: { mime: string; ext: string; size: number; hasThumb: boolean };

  try {
    const result = await writeWithDb(
      db,
      ctx,
      (tx, changes) => {
        const conn = (
          tx as unknown as { $client: import("better-sqlite3").Database }
        ).$client ?? (
          db as unknown as { $client: import("better-sqlite3").Database }
        ).$client;

        // Re-check feature inside the transaction (D4).
        assertEntityFeature(entityId, "attachments");

        tx.insert(attachments)
          .values({
            id,
            entityId,
            filename,
            mime: meta.mime,
            size: meta.size,
            storageKey: `${id}.${meta.ext}`,
            hasThumb: meta.hasThumb,
            createdBy: ctx.user.id,
            createdAt: new Date(ctx.now),
          })
          .run();

        changes.touch(entityId);
        changes.addActivity({
          entityId,
          action: "attach",
          diff: { filename: [null, filename], mime: [null, meta.mime], size: [null, meta.size] },
        });

        return {
          id,
          entityId,
          filename,
          mime: meta.mime,
          size: meta.size,
          hasThumb: meta.hasThumb,
        };
      },
      {
        prepare: async () => {
          mkdirSync(tmpDir, { recursive: true });

          // Sniff type from content — NOT the filename (spec).
          const mime = sniffMime(bytes);
          if (!mime) {
            throw new ORPCError("validation_error", {
              status: ERROR_STATUS_MAP.validation_error,
              message: "File content does not match a supported type.",
              data: {
                details: [
                  { path: "file", message: "Unrecognised or spoofed file content." },
                ],
              },
            });
          }

          // Verify type and size before storing (spec).
          validateUpload(bytes, mime, documentsAllowed);

          // Write the verified temp file.
          writeFileSync(tmpPath, bytes);

          // For images, create a 480px WebP thumbnail with sharp when available.
          let hasThumb = false;
          if (IMAGE_MIMES.has(mime)) {
            try {
              // sharp is optional and may be absent; thumbnails are best-effort.
              const sharpSpecifier: string = "sharp";
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const sharpMod: any = await import(sharpSpecifier);
              const thumb = await sharpMod.default(bytes)
                .resize({ width: 480, withoutEnlargement: true })
                .webp()
                .toBuffer();
              writeFileSync(tmpThumbPath, thumb);
              hasThumb = true;
            } catch {
              hasThumb = false;
            }
          }

          meta = {
            mime,
            ext: EXTENSION_BY_MIME[mime],
            size,
            hasThumb,
          };
          return { tmpPath, tmpThumbPath: hasThumb ? tmpThumbPath : null };
        },
        afterCommit: async (_ctx, _result, prepared) => {
          mkdirSync(uploadsDir(), { recursive: true });
          renameSync(prepared.tmpPath, join(uploadsDir(), `${id}.${meta.ext}`));
          if (prepared.tmpThumbPath) {
            renameSync(prepared.tmpThumbPath, join(uploadsDir(), `${id}.thumb.webp`));
          }
        },
      },
    );

    return result;
  } catch (err) {
    // A failed transaction must leave no temp files (spec).
    try {
      rmSync(tmpPath, { force: true });
    } catch {
      /* ignore */
    }
    try {
      rmSync(tmpThumbPath, { force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Listing / serving / removal
// ---------------------------------------------------------------------------

/** List non-purged attachments for an entity (soft-deleted included). */
export function listAttachments(
  entityId: string,
): Array<{ id: string; filename: string; mime: string; size: number; hasThumb: boolean; deletedAt: number | null }> {
  const conn = (db as unknown as { $client: import("better-sqlite3").Database })
    .$client;
  const rows = conn
    .prepare(
      `SELECT id, filename, mime, size, has_thumb, deleted_at
       FROM attachments WHERE entity_id = ?
       ORDER BY created_at ASC`,
    )
    .all(entityId) as Array<{
    id: string;
    filename: string;
    mime: string;
    size: number;
    has_thumb: number;
    deleted_at: number | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    mime: r.mime,
    size: r.size,
    hasThumb: r.has_thumb === 1,
    deletedAt: r.deleted_at ?? null,
  }));
}

/**
 * Read an attachment's bytes + metadata for serving. The row's `storage_key`
 * points to a file in the uploads directory. Throws not_found when the row or
 * file is missing.
 */
export function readAttachment(
  id: string,
  size: "full" | "thumb" = "full",
): { bytes: Buffer; mime: string; filename: string } {
  const conn = (db as unknown as { $client: import("better-sqlite3").Database })
    .$client;
  const row = conn
    .prepare("SELECT storage_key, mime, filename, has_thumb FROM attachments WHERE id = ?")
    .get(id) as
    | { storage_key: string; mime: string; filename: string; has_thumb: number }
    | undefined;

  if (!row) {
    throw new ORPCError("not_found", {
      status: ERROR_STATUS_MAP.not_found,
      message: "Attachment not found.",
    });
  }

  let path: string;
  let mime: string = row.mime;
  if (size === "thumb") {
    if (row.has_thumb !== 1) {
      throw new ORPCError("not_found", {
        status: ERROR_STATUS_MAP.not_found,
        message: "Thumbnail not available.",
      });
    }
    // Thumb is stored as <id>.thumb.webp next to the original.
    const idPart = row.storage_key.slice(0, row.storage_key.lastIndexOf("."));
    path = join(uploadsDir(), `${idPart}.thumb.webp`);
    mime = "image/webp";
  } else {
    path = join(uploadsDir(), row.storage_key);
  }

  if (!existsSync(path)) {
    throw new ORPCError("not_found", {
      status: ERROR_STATUS_MAP.not_found,
      message: "Attachment file is missing.",
    });
  }

  return { bytes: readFileSync(path), mime, filename: row.filename };
}

/** Soft-delete an attachment (undoable, restorable for 30 days). */
export function removeAttachment(
  ctx: WriteContext,
  entityId: string,
  attachmentId: string,
): Promise<void> {
  return writeWithDb(db, ctx, (tx, changes) => {
    const conn = (
      tx as unknown as { $client: import("better-sqlite3").Database }
    ).$client ?? (
      db as unknown as { $client: import("better-sqlite3").Database }
    ).$client;

    assertEntityFeature(entityId, "attachments");

    const row = conn
      .prepare("SELECT entity_id FROM attachments WHERE id = ?")
      .get(attachmentId) as { entity_id: string } | undefined;
    if (!row || row.entity_id !== entityId) {
      throw new ORPCError("not_found", {
        status: ERROR_STATUS_MAP.not_found,
        message: "Attachment not found.",
      });
    }

    conn
      .prepare("UPDATE attachments SET deleted_at = ? WHERE id = ?")
      .run(ctx.now, attachmentId);

    changes.touch(entityId);
    changes.addActivity({
      entityId,
      action: "remove-attachment",
      diff: { attachmentId: [attachmentId, null] },
    });
  });
}

// ---------------------------------------------------------------------------
// Daily orphan sweep (design D15, task 8.4)
// ---------------------------------------------------------------------------

/**
 * Daily sweep:
 *   - deletes temp files older than 1 hour;
 *   - deletes rows deleted for more than 30 days (and their files);
 *   - deletes files in the uploads dir with no corresponding row;
 *   - logs rows whose file is missing.
 */
export function sweepAttachments(
  conn: import("better-sqlite3").Database,
  now: number,
): void {
  // 1. Temp files older than 1 hour.
  const tmpDir = uploadsTmpDir();
  if (existsSync(tmpDir)) {
    const cutoff = now - 60 * 60 * 1000;
    for (const entry of readdirSafe(tmpDir)) {
      const full = join(tmpDir, entry);
      const stat = statSafe(full);
      if (stat && stat.mtimeMs < cutoff) {
        rmSync(full, { force: true });
      }
    }
  }

  // 2. Rows deleted for more than 30 days: unlink files, then delete rows.
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const expired = conn
    .prepare(
      "SELECT id, storage_key, has_thumb FROM attachments WHERE deleted_at IS NOT NULL AND deleted_at < ?",
    )
    .all(now - thirtyDaysMs) as Array<{
    id: string;
    storage_key: string;
    has_thumb: number;
  }>;

  for (const row of expired) {
    rmSafe(join(uploadsDir(), row.storage_key));
    if (row.has_thumb === 1) {
      const idPart = row.storage_key.slice(0, row.storage_key.lastIndexOf("."));
      rmSafe(join(uploadsDir(), `${idPart}.thumb.webp`));
    }
    conn.prepare("DELETE FROM attachments WHERE id = ?").run(row.id);
  }

  // 3. Files in the uploads dir with no corresponding row (orphans).
  // We only consider non-temp, known-extension files.
  const rows: Array<{ storage_key: string }> = conn
    .prepare("SELECT storage_key FROM attachments")
    .all() as Array<{ storage_key: string }>;
  const knownKeys = new Set(rows.map((r) => r.storage_key));
  const idParts = new Set(
    rows.map((r) => r.storage_key.slice(0, r.storage_key.lastIndexOf("."))),
  );

  if (existsSync(uploadsDir())) {
    for (const entry of readdirSafe(uploadsDir())) {
      if (entry.endsWith(".thumb.webp")) {
        if (!idParts.has(entry.slice(0, -".thumb.webp".length))) {
          rmSafe(join(uploadsDir(), entry));
        }
      } else if (entry.includes(".") && !entry.startsWith("tmp")) {
        // A full file (id.ext). If its row is gone, delete it.
        if (!knownKeys.has(entry) && !idParts.has(entry.slice(0, entry.lastIndexOf(".")))) {
          rmSafe(join(uploadsDir(), entry));
        }
      }
    }
  }

  // 4. Log rows whose file is missing.
  for (const row of rows) {
    if (!existsSync(join(uploadsDir(), row.storage_key))) {
      console.error(
        `[attachment-sweep] missing file for attachment row ${row.storage_key}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Tiny fs helpers
// ---------------------------------------------------------------------------

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir) as string[];
  } catch {
    return [];
  }
}

function statSafe(path: string): { mtimeMs: number } | null {
  try {
    return statSync(path) as { mtimeMs: number };
  } catch {
    return null;
  }
}

function rmSafe(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    /* ignore */
  }
}
