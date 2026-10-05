/**
 * Generic field introspection for module zod schemas (task 6.4).
 *
 * Extracts field metadata (label, type kind, enum values, optionality) from
 * a module definition's zod `fields` schema. Works with zod v4's
 * `globalRegistry` for `.meta()` labels and the `_zod.def` internal shape
 * for type discrimination.
 *
 * This module is isomorphic — no server-only imports.
 */

import * as z from "zod";
import type { ModuleDefinition } from "@/modules/types";

// ---------------------------------------------------------------------------
// Field descriptor
// ---------------------------------------------------------------------------

export type FieldKind = "string" | "enum" | "number" | "boolean" | "date" | "textarea";

export interface FieldDescriptor {
  /** Field key in the schema (camelCase). */
  key: string;
  /** Human label from `.meta({ label })`, or derived from key. */
  label: string;
  /** Discriminated kind for rendering. */
  kind: FieldKind;
  /** Whether the field is optional (wrapped in z.optional). */
  optional: boolean;
  /** For enum fields, the list of allowed values. */
  enumValues?: string[];
}

// ---------------------------------------------------------------------------
// Unwrap helpers
// ---------------------------------------------------------------------------

interface ZodInternals {
  def?: {
    type?: string;
    innerType?: ZodInternals;
    entries?: Record<string, string>;
    checks?: unknown[];
  };
}

function getInternals(schema: unknown): ZodInternals {
  return (schema as { _zod?: ZodInternals })?._zod ?? {};
}

/**
 * Unwrap optional / nullable wrappers to reach the core schema.
 * Returns [coreSchema, isOptional].
 */
function unwrap(schema: unknown): [unknown, boolean] {
  const internals = getInternals(schema);
  const typeName = internals.def?.type;
  if (typeName === "optional" || typeName === "nullable") {
    const inner = internals.def?.innerType;
    if (inner) {
      const [core] = unwrap({ _zod: inner });
      return [core, true];
    }
    return [schema, true];
  }
  return [schema, false];
}

/**
 * Detect if a string field represents a date based on the field key.
 * We use naming conventions: keys ending in "on", "at", "date".
 */
function isDateField(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.endsWith("on") ||
    lower.endsWith("at") ||
    lower.endsWith("date") ||
    lower === "due" ||
    lower === "dueOn" ||
    lower === "reviewOn"
  );
}

// ---------------------------------------------------------------------------
// Extract field descriptors from a module definition
// ---------------------------------------------------------------------------

export function extractFields(definition: ModuleDefinition): FieldDescriptor[] {
  const shape = definition.fields.shape as Record<string, unknown>;
  const descriptors: FieldDescriptor[] = [];

  for (const [key, rawSchema] of Object.entries(shape)) {
    // Get meta from the global registry (zod v4)
    const meta = z.globalRegistry.get(rawSchema as z.ZodType) as
      | { label?: string }
      | undefined;

    const label = meta?.label ?? humanize(key);

    // Unwrap optional/nullable
    const [coreSchema, optional] = unwrap(rawSchema);
    const coreInternals = getInternals(coreSchema);
    const typeName = coreInternals.def?.type;

    let kind: FieldKind = "string";
    let enumValues: string[] | undefined;

    if (typeName === "enum") {
      kind = "enum";
      const entries = coreInternals.def?.entries;
      if (entries) {
        enumValues = Object.keys(entries);
      }
    } else if (typeName === "number" || typeName === "int") {
      kind = "number";
    } else if (typeName === "boolean") {
      kind = "boolean";
    } else if (typeName === "string") {
      // Detect date fields by key name convention
      if (isDateField(key)) {
        kind = "date";
      } else {
        kind = "string";
      }
    }

    descriptors.push({ key, label, kind, optional, enumValues });
  }

  return descriptors;
}

/**
 * Get the field descriptors for list columns only (subset of all fields).
 * Always includes "title" first.
 */
export function extractListColumns(
  definition: ModuleDefinition,
): FieldDescriptor[] {
  const allFields = extractFields(definition);
  const fieldMap = new Map(allFields.map((f) => [f.key, f]));

  const columns: FieldDescriptor[] = [];

  // Title is always the first column
  const titleField = fieldMap.get("title");
  if (titleField) columns.push(titleField);

  // Then the declared list columns
  for (const col of definition.listColumns) {
    if (col === "title") continue; // already added
    const field = fieldMap.get(col);
    if (field) columns.push(field);
  }

  return columns;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Convert camelCase key to a human-readable label. */
function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/**
 * Format a field value for display in list/detail views.
 */
export function formatFieldValue(
  value: unknown,
  field: FieldDescriptor,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field.kind === "boolean") return value ? "Yes" : "No";
  if (field.kind === "date") return String(value);
  if (field.kind === "enum") return String(value);
  return String(value);
}
