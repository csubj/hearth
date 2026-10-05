"use client";

/**
 * Collaboration panel (tasks 9.2–9.5, design D8/D9/D13).
 *
 * Renders the notes section (server-rendered read view + editor loaded on
 * demand, autosave on a typing pause and on blur, expectedVersion conflict
 * with a reload/overwrite prompt, and a localStorage draft kept until saved),
 * the comment thread, and the multiple-assignees section. Everything goes
 * through the shared `invoke` action / oRPC procedures.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotesData {
  version: number;
  markdown: string;
  updatedBy: string | null;
  updatedAt: number | null;
}

interface CommentItem {
  id: string;
  authorId: string;
  markdown: string;
  editedAt: number | null;
  createdAt: number;
}

interface Assignee {
  id: string;
  username: string;
  name: string;
}

interface Member {
  id: string;
  username: string;
  name: string;
}

const NOTES_DRAFT_KEY = (entityId: string) => `hearth:notes-draft:${entityId}`;

const AUTOSAVE_MS = 1500;

// ---------------------------------------------------------------------------
// Tiny read-time markdown renderer (headings, lists, tasks, paragraphs)
// ---------------------------------------------------------------------------

function ReadMarkdown({ markdown }: { markdown: string }) {
  const lines = (markdown ?? "").split("\n");
  const out: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const task = /^- \[([ xX])\]\s+(.*)$/.exec(line);
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      const tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      out.push(
        <div key={i}>
          <Tag tag={tag}>{h[2]}</Tag>
        </div>,
      );
    } else if (task) {
      out.push(
        <div key={i} className="flex items-start gap-2">
          <input type="checkbox" readOnly checked={task[1]!.toLowerCase() === "x"} className="mt-1.5" />
          <span>{inlineText(task[2]!)}</span>
        </div>,
      );
    } else if (bullet) {
      out.push(
        <div key={i} className="flex items-start gap-2">
          <span className="mt-0.5">•</span>
          <span>{inlineText(bullet[1]!)}</span>
        </div>,
      );
    } else if (ordered) {
      out.push(
        <div key={i} className="flex items-start gap-2">
          <span className="mt-0.5 text-muted-foreground">{ordered[0]}</span>
          <span>{inlineText(ordered[1]!)}</span>
        </div>,
      );
    } else if (line.trim() === "") {
      out.push(<div key={i} className="h-2" />);
    } else {
      out.push(
        <p key={i} className="whitespace-pre-wrap">
          {inlineText(line)}
        </p>,
      );
    }
  });
  return <div className="text-sm leading-relaxed">{out}</div>;
}

function Tag({ tag, children }: { tag: string; children: React.ReactNode }) {
  const Tag = tag as "h1";
  return <Tag className="font-semibold">{children}</Tag>;
}

function inlineText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

// ---------------------------------------------------------------------------
// Notes section
// ---------------------------------------------------------------------------

function NotesSection({ entityId }: { entityId: string }) {
  const [notes, setNotes] = useState<NotesData | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<{ message: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftKey = NOTES_DRAFT_KEY(entityId);

  const load = useCallback(async () => {
    const [err, data] = await invoke("getNotes", { id: entityId });
    if (!err && data) {
      const n = data as unknown as NotesData;
      setNotes(n);
      // Recover an unsaved local draft if present.
      const local = window.localStorage.getItem(draftKey);
      if (local != null && local !== n.markdown) {
        setDraft(local);
        setEditing(true);
      }
    }
  }, [entityId, draftKey]);

  useEffect(() => {
    void load();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [load]);

  const persist = useCallback(
    async (content: string, expectedVersion: number) => {
      setSaving(true);
      setError(null);
      const [err, data] = await invoke("saveNotes", {
        id: entityId,
        expectedVersion,
        markdown: content,
      });
      setSaving(false);
      if (err) {
        if (err.code === "conflict") {
          setConflict({ message: err.message });
        } else {
          setError(err.message);
        }
        return false;
      }
      const saved = data as unknown as NotesData;
      setNotes((prev) =>
        prev ? { ...prev, version: saved.version, markdown: saved.markdown } : prev,
      );
      window.localStorage.removeItem(draftKey);
      setConflict(null);
      return true;
    },
    [entityId, draftKey],
  );

  const scheduleSave = useCallback(
    (content: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (notes) void persist(content, notes.version);
      }, AUTOSAVE_MS);
    },
    [notes, persist],
  );

  const handleBlur = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (editing && notes) {
      void persist(draft, notes.version);
    }
  }, [editing, notes, draft, persist]);

  const onChange = useCallback(
    (value: string) => {
      setDraft(value);
      window.localStorage.setItem(draftKey, value);
      scheduleSave(value);
    },
    [draftKey, scheduleSave],
  );

  const startEditing = () => {
    setDraft(notes?.markdown ?? "");
    setEditing(true);
    setConflict(null);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraft(notes?.markdown ?? "");
    setError(null);
    window.localStorage.removeItem(draftKey);
  };

  const overwrite = () => {
    if (!draft || !notes) return;
    // Force overwrite by sending the current binding version (last write wins).
    void persist(draft, notes.version);
  };

  const reloadFromServer = () => {
    void load();
    setEditing(false);
    setConflict(null);
  };

  return (
    <section className="rounded-lg border bg-card p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Notes</h2>
        {!editing ? (
          <Button
            size="sm"
            variant="outline"
            onClick={startEditing}
            data-testid="notes-edit-btn"
          >
            {notes?.markdown ? "Edit notes" : "Add notes"}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={cancelEditing} data-testid="notes-cancel-btn">
            Done
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive" data-testid="notes-error">
          {error}
        </p>
      )}

      {conflict && (
        <div className="rounded-md border border-destructive/40 p-3 space-y-2">
          <p className="text-sm" data-testid="notes-conflict">
            {conflict.message}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={reloadFromServer} data-testid="notes-reload">
              Reload
            </Button>
            <Button size="sm" onClick={overwrite} data-testid="notes-overwrite">
              Overwrite
            </Button>
          </div>
        </div>
      )}

      {editing ? (
        <>
          <Textarea
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            onBlur={handleBlur}
            rows={10}
            placeholder="Write notes in Markdown… use @username to mention a member."
            data-testid="notes-editor"
          />
          <p className="text-xs text-muted-foreground">
            {saving ? "Saving…" : "Autosaves while you type and when you leave."}
          </p>
        </>
      ) : notes && notes.markdown ? (
        <div data-testid="notes-read">
          <ReadMarkdown markdown={notes.markdown} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Comments section
// ---------------------------------------------------------------------------

function CommentsSection({ entityId, currentUserId }: { entityId: string; currentUserId: string }) {
  const [items, setItems] = useState<CommentItem[]>([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [err, data] = await invoke("listComments", { id: entityId });
    if (!err && data) setItems((data as { data: CommentItem[] }).data);
  }, [entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async () => {
    if (!draft.trim()) return;
    const [err] = await invoke("createComment", { id: entityId, markdown: draft });
    if (err) {
      setError(err.message);
      return;
    }
    setDraft("");
    setError(null);
    void load();
  }, [entityId, draft, load]);

  const saveEdit = useCallback(
    async (id: string) => {
      const [err] = await invoke("editComment", { id: entityId, commentId: id, markdown: editText });
      if (err) {
        setError(err.message);
        return;
      }
      setEditingId(null);
      setError(null);
      void load();
    },
    [entityId, editText, load],
  );

  const remove = useCallback(
    async (id: string) => {
      const [err] = await invoke("deleteComment", { id: entityId, commentId: id });
      if (err) {
        setError(err.message);
        return;
      }
      void load();
    },
    [entityId, load],
  );

  return (
    <section className="rounded-lg border bg-card p-6 space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Comments</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="text-sm" data-testid="comment">
              {editingId === c.id ? (
                <div className="space-y-2">
                  <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void saveEdit(c.id)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.authorId === currentUserId ? "You" : c.authorId}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString()}
                      {c.editedAt ? " (edited)" : ""}
                    </span>
                    {c.authorId === currentUserId && (
                      <button
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditText(c.markdown);
                        }}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => void remove(c.id)}
                      aria-label="Delete comment"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-1">
                    <ReadMarkdown markdown={c.markdown} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Add a comment… use @username to mention a member."
          data-testid="comment-input"
        />
        <Button size="sm" onClick={add} data-testid="comment-add-btn">
          Post
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Assignees section
// ---------------------------------------------------------------------------

function AssigneesSection({ entityId }: { entityId: string }) {
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState("");

  const load = useCallback(async () => {
    const [err, data] = await invoke("listAssignees", { id: entityId });
    if (!err && data) setAssignees((data as { data: Assignee[] }).data);
  }, [entityId]);

  useEffect(() => {
    void load();
    void (async () => {
      const [err, data] = await invoke("listMembers", {});
      if (!err && data) setMembers((data as { data: Member[] }).data);
    })();
  }, [load]);

  const add = useCallback(async () => {
    if (!selected) return;
    const [err] = await invoke("addAssignee", { id: entityId, userId: selected });
    if (!err) {
      setSelected("");
      void load();
    }
  }, [entityId, selected, load]);

  const remove = useCallback(
    async (userId: string) => {
      await invoke("removeAssignee", { id: entityId, userId });
      void load();
    },
    [entityId, load],
  );

  const eligible = members.filter((m) => !assignees.some((a) => a.id === m.id));

  return (
    <section className="rounded-lg border bg-card p-6 space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Assignees</h2>
      {assignees.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {assignees.map((a) => (
            <Badge key={a.id} variant="secondary" className="gap-1" data-testid="assignee">
              {a.name}
              <button
                className="ml-1 text-muted-foreground hover:text-foreground"
                onClick={() => remove(a.id)}
                aria-label={`Remove ${a.name}`}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
      {eligible.length > 0 ? (
        <div className="flex items-center gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-56" data-testid="assignee-picker">
              <SelectValue placeholder="Select a member…" />
            </SelectTrigger>
            <SelectContent>
              {eligible.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} ({m.username})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={add} data-testid="assignee-add-btn">
            Assign
          </Button>
        </div>
      ) : assignees.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active members to assign.</p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function CollaborationPanel({
  entityId,
  features,
  currentUserId,
}: {
  entityId: string;
  features: { notes: boolean; comments: boolean; assignees: boolean };
  currentUserId: string;
}) {
  const hasAny = features.notes || features.comments || features.assignees;
  if (!hasAny) return null;
  return (
    <div className="space-y-6">
      {features.notes && <NotesSection entityId={entityId} />}
      {features.assignees && <AssigneesSection entityId={entityId} />}
      {features.comments && <CommentsSection entityId={entityId} currentUserId={currentUserId} />}
    </div>
  );
}
