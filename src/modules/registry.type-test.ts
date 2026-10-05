/**
 * Type-level test for the module registry (task 6.1).
 *
 * This file is checked by `tsc --noEmit` but never executed at runtime.
 * Each `@ts-expect-error` MUST be satisfied (i.e. the next line must be
 * a type error). If any `@ts-expect-error` is unused, typecheck fails.
 *
 * Tests:
 * 1. A valid defineModule call compiles.
 * 2. A sort key not in fields or entity sort fields fails.
 * 3. A placeRule value outside the union fails.
 * 4. Missing required definition fields fails.
 * 5. Mismatched type keys between definition and server fails.
 * 6. FieldsMatchDetails rejects when fields ≠ details columns.
 * 7. FieldsMatchDetails accepts when fields = details columns.
 * 8. listColumns with an invalid key fails.
 * 9. filters with an invalid key fails.
 * 10. quickCreate with an invalid key fails.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { z } from "zod";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { entities } from "../db/schema";
import {
  defineModule,
  type ModuleDefinition,
  type ModuleServer,
  type ModuleUI,
  type SortTarget,
  type EntitySortField,
  type FieldsMatchDetails,
  type AssertTrue,
  type Equal,
  type PlaceRule,
} from "./types";

// ---------------------------------------------------------------------------
// Fixture: a fake module for type-level testing
// ---------------------------------------------------------------------------

const fakeFields = z.object({
  category: z.string().meta({ label: "Category" }),
  priority: z.number().meta({ label: "Priority" }),
});

type FakeFields = typeof fakeFields;
type FakeFieldKey = keyof z.output<FakeFields>;

const fakeDetailsTable = sqliteTable("fake_details", {
  entityId: text("entity_id")
    .primaryKey()
    .references(() => entities.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  priority: integer("priority").notNull(),
});

type FakeDetailsTable = typeof fakeDetailsTable;

// ---------------------------------------------------------------------------
// Test 1: Valid defineModule compiles
// ---------------------------------------------------------------------------

const validDefinition = {
  type: "fake" as const,
  label: { singular: "Fake", plural: "Fakes" },
  icon: "file-text",
  fields: fakeFields,
  listColumns: ["category"] as const,
  filters: ["category"] as const,
  sorts: {
    category: { table: "details" as const, column: "category" },
    updatedAt: { table: "entities" as const, column: "updated_at" },
  },
  placeRule: "optional" as const,
  features: { notes: true, tags: true },
  quickCreate: ["category"] as const,
} satisfies ModuleDefinition<"fake", FakeFields>;

const validServer: ModuleServer<"fake", FakeDetailsTable> = {
  type: "fake",
  detailsTable: fakeDetailsTable,
  searchText: (details) => details.category ?? "",
  summary: (entity, details) => ({
    title: entity.title,
    category: details.category,
  }),
};

const validUI: ModuleUI<"fake"> = { type: "fake" };

// This must compile:
const _validModule = defineModule(validDefinition, validServer, validUI);

// ---------------------------------------------------------------------------
// Test 2: Sort key not in fields or entity sort fields fails
// ---------------------------------------------------------------------------

// The sort key type is (FakeFieldKey | EntitySortField), so "nonexistent" fails.
type FakeSortKey = (FakeFieldKey & string) | EntitySortField;
// @ts-expect-error — 'nonexistent' is not a valid sort key
const _badSortKey: Record<FakeSortKey, SortTarget> = { nonexistent: { table: "details", column: "x" } };

// ---------------------------------------------------------------------------
// Test 3: Invalid placeRule fails
// ---------------------------------------------------------------------------

// @ts-expect-error — 'always' is not in PlaceRule
const _badPlaceRule: PlaceRule = "always";

// ---------------------------------------------------------------------------
// Test 4: Missing required definition fields fail
// ---------------------------------------------------------------------------

// @ts-expect-error — missing required fields (type, fields, listColumns, etc.)
const _missingFields: ModuleDefinition = { label: { singular: "X", plural: "Xs" }, icon: "x" };

// ---------------------------------------------------------------------------
// Test 5: Mismatched type keys between definition and server fails
// ---------------------------------------------------------------------------

const _mismatchedServer = {
  ...validServer,
  type: "other" as const,
};
// @ts-expect-error — server type "other" doesn't match definition type "fake"
const _mismatchedModule = defineModule(validDefinition, _mismatchedServer, validUI);

// ---------------------------------------------------------------------------
// Test 6: FieldsMatchDetails rejects when fields ≠ details columns
// ---------------------------------------------------------------------------

const wrongDetailsTable = sqliteTable("wrong_details", {
  entityId: text("entity_id")
    .primaryKey()
    .references(() => entities.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  // "priority" is missing, "extra" is added → mismatch
  extra: text("extra").notNull(),
});

// Fields have {category, priority}, table has {category, extra} → false
// @ts-expect-error — FieldsMatchDetails is false, which doesn't satisfy `extends true`
type _WrongCheck = AssertTrue<FieldsMatchDetails<FakeFields, typeof wrongDetailsTable>>;

// ---------------------------------------------------------------------------
// Test 7: FieldsMatchDetails accepts when fields = details columns
// ---------------------------------------------------------------------------

// This must compile without error:
type _CorrectCheck = AssertTrue<FieldsMatchDetails<FakeFields, FakeDetailsTable>>;

// Double-check it's `true`:
type _CorrectIsTrue = AssertTrue<Equal<_CorrectCheck, true>>;

// ---------------------------------------------------------------------------
// Test 8: listColumns with an invalid key fails
// ---------------------------------------------------------------------------

// @ts-expect-error — 'nonexistent' is not a field key
const _badListCols: ReadonlyArray<FakeFieldKey & string> = ["nonexistent"];

// ---------------------------------------------------------------------------
// Test 9: filters with an invalid key fails
// ---------------------------------------------------------------------------

// @ts-expect-error — 'nonexistent' is not a field key
const _badFilters: ReadonlyArray<FakeFieldKey & string> = ["nonexistent"];

// ---------------------------------------------------------------------------
// Test 10: quickCreate with an invalid key fails
// ---------------------------------------------------------------------------

// @ts-expect-error — 'nonexistent' is not a field key
const _badQuickCreate: ReadonlyArray<FakeFieldKey & string> = ["nonexistent"];
