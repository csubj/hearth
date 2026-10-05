import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defineConfig } from "drizzle-kit";
import { resolveDatabasePath } from "./src/db/path";

const url = resolveDatabasePath();

// better-sqlite3 refuses to open a file whose parent directory is missing;
// ensure it exists so `drizzle-kit migrate` works on a fresh checkout.
if (url !== ":memory:") {
  mkdirSync(dirname(url), { recursive: true });
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema",
  out: "./drizzle",
  dbCredentials: {
    url,
  },
});
