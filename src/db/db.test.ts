import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./client";
import { meta } from "./schema";
import { createTestDatabase } from "./testing";

describe("database client pragmas", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("applies the D19 pragmas on a file database", () => {
    const dir = mkdtempSync(join(tmpdir(), "hearth-db-"));
    dirs.push(dir);
    const connection = openDatabase(join(dir, "hearth.db"));

    expect(connection.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(connection.pragma("synchronous", { simple: true })).toBe(2);
    expect(connection.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(connection.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(connection.pragma("temp_store", { simple: true })).toBe(2);

    connection.close();
  });

  it("maps a memory URL to an in-memory database", () => {
    const connection = openDatabase("file::memory:?cache=shared");
    expect(connection.pragma("journal_mode", { simple: true })).toBe("memory");
    connection.close();
  });
});

describe("test database helper", () => {
  it("applies all migrations to an in-memory database and can query the schema", () => {
    const { client, connection } = createTestDatabase();

    client.insert(meta).values({ key: "schema_version", value: "1" }).run();

    const rows = client.select().from(meta).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("schema_version");

    // The migration was genuinely applied to the connection.
    expect(connection.prepare("SELECT count(*) AS n FROM _meta").get()).toEqual({ n: 1 });

    connection.close();
  });
});
