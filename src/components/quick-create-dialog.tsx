"use client";

/**
 * Global quick-create dialog (task 13.2, design D2/D17).
 *
 * Lets a member pick a module and create an entity using only its
 * required (quickCreate) fields, then optionally open the detail page.
 * The dialog is registry-driven: the module list and fields come from the
 * module definitions. It supports a `context` prefill for the place.
 *
 * Reads field descriptors (isomorphic) passed from the server shell.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { invoke } from "@/lib/actions/invoke";
import { moduleIcon } from "@/components/module-icon";
import type { FieldDescriptor } from "@/lib/module-fields";

export interface QuickCreateModule {
  type: string;
  singular: string;
  plural: string;
  icon: string | undefined;
  placeRule: string;
  fields: FieldDescriptor[];
}

export interface QuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modules: QuickCreateModule[];
  /** Prefill context: the place to create in (e.g. from the places page). */
  contextPlaceId?: string | null;
  /** When set, create then navigate to the detail page. Default true. */
  openDetail?: boolean;
  /** Entitlement id passed through so a parent can know the created entity. */
  onCreated?: (entity: { id: string; type: string }) => void;
}

function procedurePrefix(type: string): string {
  return type.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function QuickCreateDialog({
  open,
  onOpenChange,
  modules,
  contextPlaceId,
  openDetail = true,
  onCreated,
}: QuickCreateDialogProps) {
  const router = useRouter();
  const [moduleType, setModuleType] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => modules.find((m) => m.type === moduleType) ?? null,
    [modules, moduleType],
  );

  // Reset the form whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setModuleType(modules.length === 1 ? modules[0]!.type : null);
      setValues({});
      setError(null);
    }
  }, [open, modules]);

  if (!open) return null;

  const handleField = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleCreate = () => {
    if (!selected) return;
    setError(null);
    const prefix = procedurePrefix(selected.type);

    startTransition(async () => {
      const input: Record<string, unknown> = {};
      for (const field of selected.fields) {
        const val = values[field.key];
        if (val !== undefined && val !== "") {
          if (field.kind === "number") input[field.key] = Number(val);
          else if (field.kind === "boolean") input[field.key] = val === "true";
          else input[field.key] = val;
        }
      }
      if (contextPlaceId) input.placeId = contextPlaceId;

      const [err, result] = await invoke(`${prefix}Create`, input);
      if (err) {
        setError(err.message);
        return;
      }
      const entity = result as { id: string; type: string };
      onCreated?.(entity);
      onOpenChange(false);
      if (openDetail) {
        router.push(`/${selected.type}/${entity.id}`);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create"
        className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Create</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ×
          </button>
        </div>

        {/* Module picker */}
        {modules.length > 1 && (
          <div className="mb-4 grid grid-cols-2 gap-2">
            {modules.map((m) => {
              const Icon = moduleIcon(m.icon);
              const isSel = m.type === moduleType;
              return (
                <button
                  key={m.type}
                  type="button"
                  onClick={() => setModuleType(m.type)}
                  className={`flex min-h-[44px] items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isSel
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                  data-testid={`create-module-${m.type}`}
                >
                  <Icon className="h-4 w-4" />
                  {m.singular}
                </button>
              );
            })}
          </div>
        )}

        {selected ? (
          <div className="space-y-3">
            {selected.fields.map((field) => (
              <QuickCreateField
                key={field.key}
                field={field}
                value={values[field.key] ?? ""}
                onChange={(v) => handleField(field.key, v)}
              />
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending}
              className="flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              data-testid="quick-create-submit"
            >
              {isPending ? "Creating…" : "Create"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Choose a module to create.</p>
        )}
      </div>
    </div>
  );
}

function QuickCreateField({
  field,
  value,
  onChange,
}: {
  field: FieldDescriptor;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `qc-${field.key}`;
  const base =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {field.label}
        {field.optional ? (
          <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
        ) : null}
      </label>
      {field.kind === "enum" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={base}
          data-testid={`qc-input-${field.key}`}
        >
          <option value="">Select…</option>
          {field.enumValues?.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={
            field.kind === "date"
              ? "date"
              : field.kind === "number"
                ? "number"
                : "text"
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={!field.optional}
          className={base}
          data-testid={`qc-input-${field.key}`}
        />
      )}
    </div>
  );
}
