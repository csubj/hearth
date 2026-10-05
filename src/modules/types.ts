/**
 * Module registry type system (task 6.1, design D2).
 *
 * Defines the contract every module must satisfy: a definition (isomorphic),
 * a server part (details table + helpers), and an optional UI part.
 *
 * Everything here is isomorphic — no server-only or Drizzle imports.
 */

import type { z } from "zod";
import type { Table } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Place rule (design D2 / D7)
// ---------------------------------------------------------------------------

/** How the module relates to places. */
export type PlaceRule = "required" | "prominent" | "optional" | "hidden";

// ---------------------------------------------------------------------------
// Shared features toggle (design D2 / spec)
// ---------------------------------------------------------------------------

/** Which shared features are enabled for a module's entities. */
export interface ModuleFeatures {
  notes?: boolean;
  comments?: boolean;
  attachments?: boolean | { documents?: boolean };
  reminders?: boolean;
  assignees?: boolean;
  links?: boolean;
  tags?: boolean;
}

// ---------------------------------------------------------------------------
// Detail sections (design D2)
// ---------------------------------------------------------------------------

/** A named section shown on the entity detail page. */
export interface DetailSection {
  key: string;
  label: string;
  /** Ordering weight (lower = higher on page). */
  order?: number;
}

// ---------------------------------------------------------------------------
// Sort target (design D2)
// ---------------------------------------------------------------------------

/**
 * A sort target references either an entity column or a details column.
 * The column name is a string; at runtime task 6.2 validates it against
 * indexed columns.
 */
export interface SortTarget {
  table: "entities" | "details";
  column: string;
}

/**
 * Built-in entity fields that can be used as sort keys alongside module fields.
 */
export type EntitySortField =
  | "title"
  | "createdAt"
  | "updatedAt"
  | "archivedAt";

// ---------------------------------------------------------------------------
// Module definition (isomorphic — definition.ts)
// ---------------------------------------------------------------------------

/**
 * A field-schema–aware module definition.
 *
 * `TType` is the literal string type key (e.g. `"notes-page"`).
 * `TFields` is a `z.ZodObject` whose keys are the module's typed fields.
 *
 * `listColumns`, `filters`, `sorts`, and `quickCreate` are constrained to
 * keys of the fields schema (or entity sort fields for `sorts`), so a typo
 * or drift is a type error.
 */
export interface ModuleDefinition<
  TType extends string = string,
  TFields extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>,
> {
  /** Unique module type key, used in `entities.type` and URL paths. */
  readonly type: TType;

  /** Human-readable labels. */
  readonly label: { singular: string; plural: string };

  /**
   * Lucide icon name (string) for nav / headings.
   * Modules may also supply a React component at the UI layer.
   */
  readonly icon: string;

  /** Zod object schema for the module's typed fields (stored in `<type>_details`). */
  readonly fields: TFields;

  /** Which fields to show as columns in list views. */
  readonly listColumns: ReadonlyArray<keyof z.output<TFields> & string>;

  /** Fields that can be used as filters. */
  readonly filters: ReadonlyArray<keyof z.output<TFields> & string>;

  /**
   * Sortable fields. Each key is a field key or an entity built-in sort
   * field; each value maps to an indexed column on entities or the details
   * table. Unknown keys are a type error.
   */
  readonly sorts: Partial<
    Record<
      (keyof z.output<TFields> & string) | EntitySortField,
      SortTarget
    >
  >;

  /** How the module relates to places. */
  readonly placeRule: PlaceRule;

  /** Which shared features this module enables. */
  readonly features: ModuleFeatures;

  /** Fields shown in the quick-create dialog (subset of field keys). */
  readonly quickCreate: ReadonlyArray<keyof z.output<TFields> & string>;

  /** Sections on the detail page. */
  readonly detailSections?: ReadonlyArray<DetailSection>;
}

// ---------------------------------------------------------------------------
// Module server (server-only — server.ts)
// ---------------------------------------------------------------------------

/**
 * The server half of a module registration.
 *
 * `TType` is the literal type key.
 * `TTable` is the Drizzle table for `<type>_details`.
 */
export interface ModuleServer<
  TType extends string = string,
  TTable extends Table = Table,
> {
  readonly type: TType;
  /** The `<type>_details` Drizzle table (entity_id PK → entities ON DELETE CASCADE). */
  readonly detailsTable: TTable;
  /** Produce a search-indexable text from a details row. */
  readonly searchText: (details: TTable["$inferSelect"]) => string;
  /** Produce a summary object for Today / API. */
  readonly summary: (
    entity: { id: string; title: string; type: string },
    details: TTable["$inferSelect"],
  ) => Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Module UI (optional — ui.tsx)
// ---------------------------------------------------------------------------

/** The optional UI half of a module registration (detail/list overrides). */
export interface ModuleUI<TType extends string = string> {
  readonly type: TType;
  /** Override component for a detail section. */
  readonly DetailSection?: React.ComponentType<{ entityId: string }>;
  /** Override component for a list row. */
  readonly ListRow?: React.ComponentType<{ entityId: string }>;
}

// ---------------------------------------------------------------------------
// Combined module record
// ---------------------------------------------------------------------------

/** A fully registered module: definition + server + optional UI. */
export interface ModuleRecord<
  TType extends string = string,
  TFields extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>,
  TTable extends Table = Table,
> {
  readonly definition: ModuleDefinition<TType, TFields>;
  readonly server: ModuleServer<TType, TTable>;
  readonly ui: ModuleUI<TType> | null;
}

// ---------------------------------------------------------------------------
// Module registry (keyed by type)
// ---------------------------------------------------------------------------

/**
 * A module server with erased table type for heterogeneous storage.
 * The `searchText` and `summary` functions accept `any` so that concrete
 * module servers (with typed details rows) can be stored in one record.
 */
export interface AnyModuleServer {
  readonly type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly detailsTable: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly searchText: (details: any) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly summary: (entity: { id: string; title: string; type: string }, details: any) => Record<string, unknown>;
}

/**
 * A module record with erased generic parameters, for storage in the
 * heterogeneous registry. Individual modules are strongly typed at
 * definition time via `defineModule()`; this type is used for iteration.
 */
export interface AnyModuleRecord {
  readonly definition: ModuleDefinition;
  readonly server: AnyModuleServer;
  readonly ui: ModuleUI | null;
}

/**
 * The module registry: a record keyed by module type of `AnyModuleRecord`.
 * Downstream code (procedure generation, nav, search) iterates this.
 */
export type ModuleRegistry = Record<string, AnyModuleRecord>;

// ---------------------------------------------------------------------------
// defineModule() — the entry point for registering a module
// ---------------------------------------------------------------------------

/**
 * Create a typed module record. The type parameter on `definition.type`
 * threads through to `server` and `ui`, so mismatched types fail typecheck.
 */
export function defineModule<
  TType extends string,
  TFields extends z.ZodObject<z.ZodRawShape>,
  TTable extends Table,
>(
  definition: ModuleDefinition<TType, TFields>,
  server: ModuleServer<NoInfer<TType>, TTable>,
  ui?: ModuleUI<NoInfer<TType>> | null,
): ModuleRecord<TType, TFields, TTable> {
  return { definition, server, ui: ui ?? null };
}

// ---------------------------------------------------------------------------
// Type-level helpers
// ---------------------------------------------------------------------------

/**
 * `Equal<A, B>` resolves to `true` when A and B are the exact same type.
 * Used in compile-time assertions with concrete types only.
 */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/** Compile-time assertion: `T` must be `true`. */
export type AssertTrue<T extends true> = T;

/**
 * Check whether the keys of a zod object schema equal the insert columns
 * of a Drizzle details table (excluding `entityId`, which is the PK and
 * not a module field).
 *
 * Resolves to `true` when they match, `false` when they differ.
 * Use with concrete types only (not generic parameters).
 *
 * Usage (in a type-test file):
 * ```ts
 * // Must compile:
 * type _Ok = AssertTrue<FieldsMatchDetails<typeof myFields, typeof myTable>>;
 * // @ts-expect-error — must fail:
 * type _Bad = AssertTrue<FieldsMatchDetails<typeof wrongFields, typeof wrongTable>>;
 * ```
 */
export type FieldsMatchDetails<
  TFields extends z.ZodObject<z.ZodRawShape>,
  TTable extends Table,
> = Equal<
  keyof z.output<TFields>,
  Exclude<keyof TTable["$inferInsert"], "entityId">
>;
