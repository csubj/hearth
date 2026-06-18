"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPES,
  allowsDocuments,
} from "@/lib/attachments/config";
import type { AttachmentEntityType } from "@/lib/attachments/entity";
import type { AttachmentSummary } from "@/lib/attachments/queries";

const MAX_ATTACHMENTS_PER_ENTITY = 10;

function isPdf(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

function acceptAttribute(entityType: AttachmentEntityType): string {
  const imageAccept = ALLOWED_IMAGE_MIME_TYPES.join(",");
  if (!allowsDocuments(entityType)) {
    return imageAccept;
  }
  return [...ALLOWED_IMAGE_MIME_TYPES, ...ALLOWED_DOCUMENT_MIME_TYPES, ".pdf"].join(",");
}

export function AttachmentsPanel({
  entityType,
  entityId,
  initialAttachments,
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  initialAttachments: AttachmentSummary[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialAttachments);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const documentsAllowed = allowsDocuments(entityType);
  const accept = useMemo(() => acceptAttribute(entityType), [entityType]);
  const lightboxItem = items.find((item) => item.id === lightboxId) ?? null;
  const atLimit = items.length >= MAX_ATTACHMENTS_PER_ENTITY;

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("entityType", entityType);
      formData.set("entityId", entityId);

      const response = await fetch("/api/attachments", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as { id?: string; url?: string; error?: string };

      if (!response.ok || !payload.id || !payload.url) {
        setError(payload.error ?? "Upload failed.");
        return;
      }

      setItems((current) => [
        {
          id: payload.id!,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          url: payload.url!,
          createdAt: new Date(),
        },
        ...current,
      ]);
      refresh();
    } catch {
      setError("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setDeletingId(id);

    try {
      const response = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Delete failed.");
        return;
      }

      setItems((current) => current.filter((item) => item.id !== id));
      if (lightboxId === id) {
        setLightboxId(null);
      }
      refresh();
    } catch {
      setError("Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  const heading = documentsAllowed ? "Photos & documents" : "Photos";
  const emptyLabel = documentsAllowed ? "No files yet." : "No photos yet.";
  const addLabel = uploading
    ? "Uploading…"
    : atLimit
      ? "File limit reached"
      : documentsAllowed
        ? "Add file"
        : "Add photo";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-text">{heading}</h3>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-accent hover:text-accent/90">
          <input
            type="file"
            accept={accept}
            className="sr-only"
            disabled={uploading || atLimit}
            onChange={handleUpload}
          />
          <span className="rounded-md border border-border px-2 py-1 transition-colors hover:bg-accent-soft disabled:opacity-50">
            {addLabel}
          </span>
        </label>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyLabel}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {items.map((item) => (
            <li
              key={item.id}
              className="group relative aspect-square overflow-hidden rounded-md border border-border bg-accent-soft/30"
            >
              {isPdf(item.mimeType) ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-text-muted"
                >
                  <span aria-hidden className="text-2xl">
                    PDF
                  </span>
                  <span className="line-clamp-2">{item.filename}</span>
                </a>
              ) : (
                <button
                  type="button"
                  className="h-full w-full focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                  onClick={() => setLightboxId(item.id)}
                  aria-label={`View ${item.filename}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.filename}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
                className="absolute top-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 disabled:opacity-50"
                aria-label={`Remove ${item.filename}`}
              >
                {deletingId === item.id ? "…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog.Root open={lightboxId !== null} onOpenChange={(open) => !open && setLightboxId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[min(90vw,48rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg bg-surface shadow-card focus:outline-none">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <Dialog.Title className="truncate text-sm font-medium text-text">
                {lightboxItem?.filename ?? "Photo"}
              </Dialog.Title>
              <Dialog.Close className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-accent-soft hover:text-text">
                Close
              </Dialog.Close>
            </div>
            {lightboxItem && !isPdf(lightboxItem.mimeType) ? (
              <div className="relative flex max-h-[calc(90vh-3rem)] items-center justify-center bg-black/5 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={lightboxItem.url}
                  alt={lightboxItem.filename}
                  className="max-h-[calc(90vh-4rem)] max-w-full object-contain"
                />
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
