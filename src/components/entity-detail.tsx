"use client";

/**
 * Shared entity detail header + inline field editing (task 13.3, D12/D13/D17).
 *
 * Renders the title and each key field as a read-only value that becomes an
 * editable input on click/focus, saving on Enter or blur with a short toast
 * and no full reload. Every save carries `expectedVersion`; a version
 * mismatch returns a conflict that keeps the typed value in the field and
 * offers to reload.
 */

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { invoke } from "@/lib/actions/invoke";
import { formatFieldValue, type FieldDescriptor } from "@/lib/module-fields";
import { Button } from "@/components/ui/button";

export interface EntityDetailProps {
  moduleType: string;
  label: { singular: string; plural: string };
  fields: FieldDescriptor[];
  entity: Record<string, unknown>;
  children?: React.ReactNode;
}

function procedurePrefix(type: string): string {
  return type.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function EntityDetail({
  moduleType,
  label,
  fields,
  entity: initialEntity,
  children,
}: EntityDetailProps) {
  const router = useRouter();
  const prefix = procedurePrefix(moduleType);

  const [entity, setEntity] = useState(initialEntity);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isSaving, startSaving] = useTransition();
  const draftRef = useRef("");

  // -------------------------------------------------------------------------
  // Inline save of a single field with expectedVersion (D13).
  // -------------------------------------------------------------------------
  const saveField = useCallback(
    (field: FieldDescriptor) => {
      const raw = draftRef.current;
      setEditingKey(null);
      startSaving(async () => {
        let value: unknown;
        if (field.kind === "number") {
          value = raw ? Number(raw) : field.optional ? null : undefined;
        } else if (field.kind === "boolean") {
          value = raw === "true";
        } else if (field.optional && raw === "") {
          value = null;
        } else {
          value = raw || undefined;
        }

        const [error, result] = await invoke(`${prefix}Update`, {
          id: entity.id,
          expectedVersion: entity.version,
          data: { [field.key]: value },
        });

        if (error) {
          if (error.code === "conflict") {
            // Keep the typed value and offer reload (D13).
            setDraft(raw);
            setEditingKey(field.key);
            toast("This item was changed by someone else.", {
              description: "Reload to discard your change, or overwrite it.",
              action: {
                label: "Reload",
                onClick: () => router.refresh(),
              },
            });
            return;
          }
          toast.error(error.message);
          return;
        }

        const updated = result as Record<string, unknown>;
        setEntity(updated);
        toast.success("Saved.");
      });
    },
    [entity, prefix, router],
  );

  // -------------------------------------------------------------------------
  // Archive / delete (kept from the prior detail page).
  // -------------------------------------------------------------------------
  const handleArchive = useCallback(() => {
    startSaving(async () => {
      const isArchived = entity.archivedAt != null;
      const action = isArchived ? "Unarchive" : "Archive";
      const procKey = isArchived ? `${prefix}Unarchive` : `${prefix}Archive`;
      const [error] = await invoke(procKey, { id: entity.id });
      if (error) {
        toast.error(`${action} failed: ${error.message}`);
        return;
      }
      router.push(`/${moduleType}`);
    });
  }, [entity, prefix, moduleType, router]);

  const handleDelete = useCallback(() => {
    startSaving(async () => {
      const [error] = await invoke(`${prefix}Delete`, { id: entity.id });
      if (error) {
        toast.error(`Delete failed: ${error.message}`);
        return;
      }
      // Find the delete activity entry so the toast Undo can reverse it.
      const [actErr, activity] = await invoke("listActivity", {
        entityId: entity.id as string,
        limit: 1,
      });
      const deleteEntry = actErr
        ? null
        : (activity as { data: Array<{ id?: string; action?: string }> }).data.find(
            (e) => e.action === "delete",
          );
      toast("Deleted.", {
        action: deleteEntry?.id
          ? {
              label: "Undo",
              onClick: async () => {
                const [uErr] = await invoke("activityUndo", { id: deleteEntry.id });
                if (uErr) toast.error(uErr.message);
                else {
                  toast.success("Restored.");
                  router.refresh();
                }
              },
            }
          : undefined,
      });
      router.push(`/${moduleType}`);
    });
  }, [entity, prefix, moduleType, router]);

  const startEdit = useCallback(
    (field: FieldDescriptor, current: unknown) => {
      const str =
        current == null
          ? ""
          : field.kind === "boolean"
            ? String(current) === "true"
              ? "true"
              : "false"
            : String(current);
      draftRef.current = str;
      setDraft(str);
      setEditingKey(field.key);
    },
    [],
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/${moduleType}`} className="hover:text-foreground">
          {label.plural}
        </Link>
        <span>/</span>
        <span className="text-foreground">{entity.title as string}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <EditableField
            ariaLabel="Title"
            testId="entity-title"
            display={
              <span className="text-2xl font-semibold tracking-tight">
                {String(entity.title ?? "Untitled")}
              </span>
            }
            isEditing={editingKey === "title"}
            onStart={() => startEdit(titleField(fields), entity.title)}
            onCancel={() => setEditingKey(null)}
            onSave={() => saveField(titleField(fields))}
            draft={draft}
            setDraft={(v) => {
              draftRef.current = v;
              setDraft(v);
            }}
            kind="string"
          />
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button
            variant="outline"
            onClick={handleArchive}
            disabled={isSaving}
            className="min-h-[36px]"
          >
            {entity.archivedAt != null ? "Unarchive" : "Archive"}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isSaving}
            className="min-h-[36px]"
            data-testid="delete-btn"
          >
            {isSaving ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>

      {/* Key fields */}
      <div className="space-y-3 rounded-lg border bg-card p-6">
        {fields
          .filter((f) => f.key !== "title")
          .map((field) => (
            <div key={field.key} className="grid grid-cols-3 gap-4 items-start">
              <label className="pt-1 text-sm text-muted-foreground">
                {field.label}
              </label>
              <div className="col-span-2">
                <EditableField
                  ariaLabel={field.label}
                  testId={`field-${field.key}`}
                  display={
                    entity[field.key] == null || entity[field.key] === "" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      formatFieldValue(entity[field.key], field)
                    )
                  }
                  isEditing={editingKey === field.key}
                  onStart={() => startEdit(field, entity[field.key])}
                  onCancel={() => setEditingKey(null)}
                  onSave={() => saveField(field)}
                  draft={draft}
                  setDraft={(v) => {
                    draftRef.current = v;
                    setDraft(v);
                  }}
                  kind={field.kind}
                  enumValues={field.enumValues}
                />
              </div>
            </div>
          ))}

        <div className="grid grid-cols-3 gap-4 items-start border-t pt-4 text-sm">
          <div className="text-muted-foreground">Version</div>
          <div className="col-span-2" data-testid="entity-version">
            {entity.version as number}
          </div>
          <div className="text-muted-foreground">Updated</div>
          <div className="col-span-2">
            {entity.updatedAt
              ? new Date(
                  entity.updatedAt as string | number,
                ).toLocaleString()
              : "—"}
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}

// A read value that becomes an edit input on focus. Saves on Enter or blur.
function EditableField({
  ariaLabel,
  testId,
  display,
  isEditing,
  onStart,
  onCancel,
  onSave,
  draft,
  setDraft,
  kind,
  enumValues,
}: {
  ariaLabel: string;
  testId: string;
  display: React.ReactNode;
  isEditing: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: () => void;
  draft: string;
  setDraft: (v: string) => void;
  kind: string;
  enumValues?: string[];
}) {
  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={onStart}
        onDoubleClick={onStart}
        className="block w-full rounded-md px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Edit ${ariaLabel}`}
        data-testid={`${testId}-read`}
        title={`Click to edit ${ariaLabel}`}
      >
        {display}
      </button>
    );
  }

  const commit = () => onSave();

  return (
    <div className="flex items-start gap-2">
      {kind === "enum" && enumValues ? (
        <select
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onCancel();
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`edit-${testId.replace("field-", "")}`}
        >
          <option value="">None</option>
          {enumValues.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <input
          autoFocus
          type={kind === "number" ? "number" : "text"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onCancel();
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`edit-${testId.replace("field-", "")}`}
        />
      )}
    </div>
  );
}

function titleField(fields: FieldDescriptor[]): FieldDescriptor {
  return (
    fields.find((f) => f.key === "title") ?? {
      key: "title",
      label: "Title",
      kind: "string",
      optional: false,
    }
  );
}
