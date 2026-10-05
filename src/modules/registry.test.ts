/**
 * Runtime tests for the module registry type system (task 6.1).
 *
 * Tests the runtime behavior of defineModule, central indexes, and the
 * registry builder. Type-level assertions are in registry.type-test.ts.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import {
  defineModule,
  type ModuleDefinition,
  type ModuleServer,
  type ModuleUI,
  type AnyModuleRecord,
  type ModuleRegistry,
  type PlaceRule,
} from "./types";
import { definitions, allDefinitions } from "./definitions";
import { uis, getUI } from "./ui";

// ---------------------------------------------------------------------------
// Fixture: inline fake module (not registered in central indexes)
// ---------------------------------------------------------------------------

const testFields = z.object({
  category: z.string().meta({ label: "Category" }),
  priority: z.number().meta({ label: "Priority" }),
});

const testDetailsTable = sqliteTable("test_details", {
  entityId: text("entity_id").primaryKey(),
  category: text("category").notNull(),
  priority: integer("priority").notNull(),
});

const testDefinition: ModuleDefinition<"test-mod", typeof testFields> = {
  type: "test-mod",
  label: { singular: "Test", plural: "Tests" },
  icon: "file-text",
  fields: testFields,
  listColumns: ["category"],
  filters: ["category"],
  sorts: {
    category: { table: "details", column: "category" },
    updatedAt: { table: "entities", column: "updated_at" },
  },
  placeRule: "optional",
  features: { notes: true, tags: true, comments: false },
  quickCreate: ["category"],
};

const testServer: ModuleServer<"test-mod", typeof testDetailsTable> = {
  type: "test-mod",
  detailsTable: testDetailsTable,
  searchText: (details) => details.category ?? "",
  summary: (entity, details) => ({
    title: entity.title,
    category: details.category,
  }),
};

const testUI: ModuleUI<"test-mod"> = { type: "test-mod" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("defineModule", () => {
  it("returns a ModuleRecord with definition, server, and ui", () => {
    const mod = defineModule(testDefinition, testServer, testUI);

    expect(mod.definition).toBe(testDefinition);
    expect(mod.server).toBe(testServer);
    expect(mod.ui).toBe(testUI);
  });

  it("defaults ui to null when not provided", () => {
    const mod = defineModule(testDefinition, testServer);
    expect(mod.ui).toBeNull();
  });

  it("defaults ui to null when explicitly null", () => {
    const mod = defineModule(testDefinition, testServer, null);
    expect(mod.ui).toBeNull();
  });

  it("preserves the type key across definition and server", () => {
    const mod = defineModule(testDefinition, testServer, testUI);
    expect(mod.definition.type).toBe("test-mod");
    expect(mod.server.type).toBe("test-mod");
    expect(mod.ui?.type).toBe("test-mod");
  });
});

describe("ModuleDefinition shape", () => {
  it("has all required fields", () => {
    expect(testDefinition.type).toBe("test-mod");
    expect(testDefinition.label.singular).toBe("Test");
    expect(testDefinition.label.plural).toBe("Tests");
    expect(testDefinition.icon).toBe("file-text");
    expect(testDefinition.fields).toBeDefined();
    expect(testDefinition.listColumns).toEqual(["category"]);
    expect(testDefinition.filters).toEqual(["category"]);
    expect(testDefinition.sorts).toBeDefined();
    expect(testDefinition.placeRule).toBe("optional");
    expect(testDefinition.features).toBeDefined();
    expect(testDefinition.quickCreate).toEqual(["category"]);
  });

  it("placeRule is one of the valid values", () => {
    const validRules: PlaceRule[] = [
      "required",
      "prominent",
      "optional",
      "hidden",
    ];
    expect(validRules).toContain(testDefinition.placeRule);
  });

  it("sorts entries reference entities or details table", () => {
    for (const [, target] of Object.entries(testDefinition.sorts)) {
      if (!target) continue;
      expect(["entities", "details"]).toContain(target.table);
      expect(typeof target.column).toBe("string");
    }
  });

  it("zod fields schema has keys matching listColumns, filters, quickCreate", () => {
    const fieldKeys = Object.keys(testDefinition.fields.shape);
    for (const col of testDefinition.listColumns) {
      expect(fieldKeys).toContain(col);
    }
    for (const f of testDefinition.filters) {
      expect(fieldKeys).toContain(f);
    }
    for (const qc of testDefinition.quickCreate) {
      expect(fieldKeys).toContain(qc);
    }
  });
});

describe("ModuleServer shape", () => {
  it("has detailsTable, searchText, and summary", () => {
    expect(testServer.detailsTable).toBeDefined();
    expect(typeof testServer.searchText).toBe("function");
    expect(typeof testServer.summary).toBe("function");
  });

  it("searchText returns a string", () => {
    const result = testServer.searchText({
      entityId: "abc",
      category: "reference",
      priority: 1,
    });
    expect(typeof result).toBe("string");
  });

  it("summary returns a record", () => {
    const result = testServer.summary(
      { id: "abc", title: "Test Entity", type: "test-mod" },
      { entityId: "abc", category: "reference", priority: 1 },
    );
    expect(typeof result).toBe("object");
    expect(result.title).toBe("Test Entity");
  });
});

describe("central indexes", () => {
  it("definitions record contains registered modules", () => {
    expect(Object.keys(definitions).length).toBeGreaterThanOrEqual(1);
    expect(definitions["notes-page"]).toBeDefined();
  });

  it("allDefinitions returns registered definitions", () => {
    expect(allDefinitions().length).toBeGreaterThanOrEqual(1);
  });

  it("uis record contains registered modules", () => {
    expect(Object.keys(uis).length).toBeGreaterThanOrEqual(1);
    expect(uis["notes-page"]).toBeDefined();
  });

  it("getUI returns undefined for unknown types", () => {
    expect(getUI("nonexistent")).toBeUndefined();
  });
});

describe("ModuleFeatures", () => {
  it("disabled features default to falsy", () => {
    const mod = defineModule(testDefinition, testServer);
    expect(mod.definition.features.notes).toBe(true);
    expect(mod.definition.features.tags).toBe(true);
    expect(mod.definition.features.comments).toBe(false);
    expect(mod.definition.features.attachments).toBeFalsy();
    expect(mod.definition.features.reminders).toBeFalsy();
    expect(mod.definition.features.assignees).toBeFalsy();
    expect(mod.definition.features.links).toBeFalsy();
  });
});

describe("ModuleRegistry type", () => {
  it("can be built from module records", () => {
    const mod = defineModule(testDefinition, testServer, testUI);
    // AnyModuleRecord erases the generic table type for heterogeneous storage
    const anyMod: AnyModuleRecord = mod;
    const registry: ModuleRegistry = {
      "test-mod": anyMod,
    };
    expect(registry["test-mod"]).toBe(mod);
    expect(registry["test-mod"].definition.type).toBe("test-mod");
  });

  it("supports iteration over all modules", () => {
    const mod = defineModule(testDefinition, testServer, testUI);
    const anyMod: AnyModuleRecord = mod;
    const registry: ModuleRegistry = { "test-mod": anyMod };
    const types = Object.keys(registry);
    expect(types).toEqual(["test-mod"]);

    for (const [type, record] of Object.entries(registry)) {
      expect(type).toBe(record.definition.type);
      expect(type).toBe(record.server.type);
    }
  });
});
