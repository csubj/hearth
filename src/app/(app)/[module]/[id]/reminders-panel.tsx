"use client";

/**
 * Reminders panel for the entity detail page (task 11.4, design D14).
 *
 * Shows every reminder on the entity (open to all members, as the spec's
 * "stays visible to everyone on the entity's detail page" requires) and lets a
 * member create, edit, complete, or delete a reminder. Reads through the oRPC
 * procedure `remindersList` and writes through `invoke`.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { invoke } from "@/lib/actions/invoke";

interface Recipient {
  id: string;
  username: string;
  name: string;
}

interface Reminder {
  id: string;
  entityId: string;
  title: string;
  kind: "interval" | "one_time";
  everyCount: number | null;
  everyUnit: string | null;
  dueOn: string;
  closedAt: number | null;
  lastCompletedAt: number | null;
  lastCompletedBy: string | null;
  createdAt: number;
  recipients: Recipient[];
}

interface Member {
  id: string;
  username: string;
  name: string;
}

const UNIT_LABELS: Record<string, string> = {
  day: "days",
  week: "weeks",
  month: "months",
  year: "years",
};

export function RemindersPanel({ entityId }: { entityId: string }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"interval" | "one_time">("interval");
  const [everyCount, setEveryCount] = useState("1");
  const [everyUnit, setEveryUnit] = useState("week");
  const [dueOn, setDueOn] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [err, data] = await invoke("remindersList", { id: entityId });
    if (!err && data) {
      setReminders((data as { data: Reminder[] }).data);
    }
  }, [entityId]);

  useEffect(() => {
    void load();
    void (async () => {
      const [err, data] = await invoke("listMembers", {});
      if (!err && data) setMembers((data as { data: Member[] }).data);
    })();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setKind("interval");
    setEveryCount("1");
    setEveryUnit("week");
    setDueOn("");
    setSelectedRecipients([]);
  };

  const startEdit = (r: Reminder) => {
    setEditingId(r.id);
    setTitle(r.title);
    setKind(r.kind);
    setEveryCount(r.everyCount ? String(r.everyCount) : "1");
    setEveryUnit(r.everyUnit ?? "week");
    setDueOn(r.dueOn);
    setSelectedRecipients(r.recipients.map((rec) => rec.id));
  };

  const save = useCallback(async () => {
    setError(null);
    const base = {
      id: entityId,
      title,
      kind,
      recipients: selectedRecipients,
    };
    const payload =
      kind === "interval"
        ? { ...base, everyCount: Number(everyCount) || 1, everyUnit }
        : { ...base, dueOn };

    if (editingId) {
      const [err] = await invoke("remindersUpdate", {
        ...payload,
        reminderId: editingId,
      });
      if (err) {
        setError(err.message);
        return;
      }
    } else {
      const [err] = await invoke("remindersCreate", payload);
      if (err) {
        setError(err.message);
        return;
      }
    }
    resetForm();
    void load();
  }, [entityId, title, kind, everyCount, everyUnit, dueOn, selectedRecipients, editingId, load]);

  const complete = useCallback(
    async (r: Reminder) => {
      const [err] = await invoke("remindersComplete", {
        id: entityId,
        reminderId: r.id,
      });
      if (err) setError(err.message);
      void load();
    },
    [entityId, load],
  );

  const removeReminder = useCallback(
    async (r: Reminder) => {
      const [err] = await invoke("remindersDelete", {
        id: entityId,
        reminderId: r.id,
      });
      if (err) setError(err.message);
      void load();
    },
    [entityId, load],
  );

  const toggleRecipient = (id: string) => {
    setSelectedRecipients((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const sorted = [...reminders].sort((a, b) =>
    a.dueOn.localeCompare(b.dueOn),
  );

  return (
    <section className="rounded-lg border bg-card p-6 space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground">Reminders</h2>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {sorted.length > 0 && (
        <ul className="space-y-2">
          {sorted.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-md border p-3"
              data-testid="reminder"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.title}</span>
                  <Badge variant="secondary">
                    {r.kind === "interval"
                      ? `Every ${r.everyCount} ${UNIT_LABELS[r.everyUnit ?? ""] ?? r.everyUnit}`
                      : "One-time"}
                  </Badge>
                  {r.closedAt ? (
                    <Badge variant="outline">Completed</Badge>
                  ) : r.dueOn < new Date().toISOString().slice(0, 10) ? (
                    <Badge variant="destructive">Overdue</Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  Due {r.dueOn}
                  {r.recipients.length > 0
                    ? ` · ${r.recipients.map((x) => x.name).join(", ")}`
                    : " · all members"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!r.closedAt && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => complete(r)}
                    data-testid="reminder-complete"
                  >
                    Complete
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeReminder(r)}
                  aria-label={`Delete ${r.title}`}
                >
                  ×
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md border border-dashed p-4 space-y-3">
        <div className="text-sm font-medium">
          {editingId ? "Edit reminder" : "Add reminder"}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor={`reminder-title-${editingId ?? "new"}`}>Title</Label>
            <Input
              id={`reminder-title-${editingId ?? "new"}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Check the water heater"
              data-testid="reminder-title"
            />
          </div>
          <div className="space-y-1">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as "interval" | "one_time")}>
              <SelectTrigger data-testid="reminder-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interval">Repeating</SelectItem>
                <SelectItem value="one_time">One-time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {kind === "interval" ? (
            <div className="space-y-1">
              <Label>Every</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={everyCount}
                  onChange={(e) => setEveryCount(e.target.value)}
                  className="w-20"
                  data-testid="reminder-every-count"
                />
                <Select value={everyUnit} onValueChange={setEveryUnit}>
                  <SelectTrigger data-testid="reminder-every-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">day(s)</SelectItem>
                    <SelectItem value="week">week(s)</SelectItem>
                    <SelectItem value="month">month(s)</SelectItem>
                    <SelectItem value="year">year(s)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="reminder-due">Due date</Label>
              <Input
                id="reminder-due"
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                data-testid="reminder-due"
              />
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Label>Recipients (optional — defaults to assignees, then all members)</Label>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const selected = selectedRecipients.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleRecipient(m.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`recipient-${m.username}`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} data-testid="reminder-save">
            {editingId ? "Save" : "Create"}
          </Button>
          {editingId && (
            <Button size="sm" variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
