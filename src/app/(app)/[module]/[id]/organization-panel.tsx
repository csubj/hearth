"use client";

/**
 * Shared organization panel for the entity detail page (tasks 8.1–8.4).
 *
 * Renders tags (add/remove chips), related entity links (two-sided labels,
 * entity picker), labeled external URLs (target=_blank rel=noopener), and an
 * attachment gallery (thumbnails + full-size viewer), all through the shared
 * procedures / endpoints.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invoke } from "@/lib/actions/invoke";

const LINK_RELATIONS = ["related", "part_of", "uses", "fixes", "replaces"] as const;

interface Tag {
  id: string;
  name: string;
}
interface LinkItem {
  id: string;
  relation: string;
  direction: "out" | "in";
  otherEntityId: string;
  otherTitle: string;
  label: string;
}
interface UrlItem {
  id: string;
  label: string;
  url: string;
}
interface AttachmentItem {
  id: string;
  filename: string;
  mime: string;
  size: number;
  hasThumb: boolean;
  deletedAt: number | null;
}
interface Candidate {
  id: string;
  title: string;
}

export function OrganizationPanel({
  entityId,
  moduleType,
  features,
}: {
  entityId: string;
  moduleType: string;
  features: {
    tags: boolean;
    links: boolean;
    urls: boolean;
    attachments: boolean | { documents?: boolean };
  };
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [urls, setUrls] = useState<UrlItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [newTag, setNewTag] = useState("");
  const [newUrlLabel, setNewUrlLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [linkTarget, setLinkTarget] = useState("");
  const [linkRelation, setLinkRelation] = useState<string>("related");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [uploading, setUploading] = useState(false);

  const reload = useCallback(async () => {
    const run = async <T,>(path: string, input: unknown): Promise<T[]> => {
      const [err, data] = await invoke(path, input);
      if (!err && data) return (data as { data: T[] }).data;
      return [];
    };
    if (features.tags) setTags(await run<Tag>("tagsList", { id: entityId }));
    if (features.links) setLinks(await run<LinkItem>("linksList", { id: entityId }));
    if (features.urls) setUrls(await run<UrlItem>("urlsList", { id: entityId }));
    if (features.attachments)
      setAttachments(await run<AttachmentItem>("attachmentsList", { id: entityId }));
  }, [entityId, features]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Load link candidates from the registered modules.
  useEffect(() => {
    if (!features.links) return;
    void (async () => {
      const [err, data] = await invoke("notesPageList", { limit: 100 });
      if (!err && data) {
        const rows = (data as { data: Candidate[] }).data;
        setCandidates([...rows]);
      }
    })();
  }, [features.links]);

  // ---------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------
  const addTag = useCallback(async () => {
    if (!newTag.trim()) return;
    const res = await invoke("tagsAdd", { id: entityId, name: newTag });
    if (!res[0]) setNewTag("");
    void reload();
  }, [entityId, newTag, reload]);

  const removeTag = useCallback(
    async (tagId: string) => {
      await invoke("tagsRemove", { id: entityId, tagId });
      void reload();
    },
    [entityId, reload],
  );

  // ---------------------------------------------------------------------
  // Links
  // ---------------------------------------------------------------------
  const addLink = useCallback(async () => {
    if (!linkTarget) return;
    await invoke("linksAdd", {
      id: entityId,
      toId: linkTarget,
      relation: linkRelation,
    });
    setLinkTarget("");
    void reload();
  }, [entityId, linkRelation, linkTarget, reload]);

  const removeLink = useCallback(
    async (linkId: string) => {
      await invoke("linksRemove", { id: entityId, linkId });
      void reload();
    },
    [entityId, reload],
  );

  // ---------------------------------------------------------------------
  // URLs
  // ---------------------------------------------------------------------
  const addUrl = useCallback(async () => {
    if (!newUrl.trim()) return;
    const [err] = await invoke("urlsAdd", {
      id: entityId,
      label: newUrlLabel || newUrl,
      url: newUrl,
    });
    if (!err) {
      setNewUrl("");
      setNewUrlLabel("");
    }
    void reload();
  }, [entityId, newUrl, newUrlLabel, reload]);

  const removeUrl = useCallback(
    async (urlId: string) => {
      await invoke("urlsRemove", { id: entityId, urlId });
      void reload();
    },
    [entityId, reload],
  );

  // ---------------------------------------------------------------------
  // Attachments
  // ---------------------------------------------------------------------
  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const form = new FormData();
        form.set("entityId", entityId);
        form.set("file", file);
        const res = await fetch("/api/attachments", {
          method: "POST",
          body: form,
        });
        if (res.ok) void reload();
      } finally {
        setUploading(false);
      }
    },
    [entityId, reload],
  );

  const removeAttachment = useCallback(
    async (id: string) => {
      await invoke("attachmentsRemove", { id: entityId, attachmentId: id });
      void reload();
    },
    [entityId, reload],
  );

  const hasAny = features.tags || features.links || features.urls || features.attachments;
  if (!hasAny) return null;

  return (
    <div className="space-y-6">
      {/* Tags */}
      {features.tags && (
        <section className="rounded-lg border bg-card p-6 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Tags</h2>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <Badge
                  key={t.id}
                  variant="secondary"
                  className="gap-1"
                  data-testid="tag-chip"
                >
                  {t.name}
                  <button
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    onClick={() => removeTag(t.id)}
                    aria-label={`Remove tag ${t.name}`}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
              placeholder="Add a tag…"
              className="max-w-48"
              data-testid="tag-input"
            />
            <Button size="sm" onClick={addTag} data-testid="tag-add-btn">
              Add
            </Button>
          </div>
        </section>
      )}

      {/* Related */}
      {features.links && (
        <section className="rounded-lg border bg-card p-6 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Related</h2>
          {links.length > 0 && (
            <ul className="space-y-1 text-sm">
              {links.map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <span data-testid="link-label">{l.label}</span>
                  <button
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    onClick={() => removeLink(l.id)}
                    aria-label="Remove link"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={linkRelation} onValueChange={setLinkRelation}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINK_RELATIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={linkTarget} onValueChange={setLinkTarget}>
              <SelectTrigger className="w-56" data-testid="link-target">
                <SelectValue placeholder="Select entity…" />
              </SelectTrigger>
              <SelectContent>
                {candidates
                  .filter((c) => c.id !== entityId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={addLink} data-testid="link-add-btn">
              Link
            </Button>
          </div>
        </section>
      )}

      {/* URLs */}
      {features.urls && (
        <section className="rounded-lg border bg-card p-6 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Links</h2>
          {urls.length > 0 && (
            <ul className="space-y-1 text-sm">
              {urls.map((u) => (
                <li key={u.id} className="flex items-center gap-2">
                  <a
                    href={u.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                    data-testid="external-url"
                  >
                    {u.label}
                  </a>
                  <button
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    onClick={() => removeUrl(u.id)}
                    aria-label="Remove URL"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={newUrlLabel}
              onChange={(e) => setNewUrlLabel(e.target.value)}
              placeholder="Label"
              className="max-w-32"
            />
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://…"
              className="max-w-64"
              data-testid="url-input"
            />
            <Button size="sm" onClick={addUrl} data-testid="url-add-btn">
              Add
            </Button>
          </div>
        </section>
      )}

      {/* Attachments */}
      {features.attachments && (
        <section className="rounded-lg border bg-card p-6 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Attachments
          </h2>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {attachments.map((a) => (
                <figure
                  key={a.id}
                  className="space-y-1"
                  data-testid="attachment"
                >
                  <a
                    href={`/api/attachments/${a.id}`}
                    target="_blank"
                    rel="noopener"
                  >
                    {a.mime.startsWith("image/") ? (
                      <img
                        src={`/api/attachments/${a.id}?size=thumb`}
                        alt={a.filename}
                        className="h-24 w-24 object-cover rounded border"
                      />
                    ) : (
                      <Badge variant="outline">{a.filename}</Badge>
                    )}
                  </a>
                  <button
                    className="block text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => removeAttachment(a.id)}
                  >
                    Remove
                  </button>
                </figure>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Input
              type="file"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f);
              }}
              data-testid="attachment-input"
            />
            {uploading && <span className="text-xs">Uploading…</span>}
          </label>
        </section>
      )}
    </div>
  );
}
