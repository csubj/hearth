/**
 * Resolve the `DATABASE_URL` env var to a better-sqlite3 filename.
 *
 * better-sqlite3 treats `file:` prefixed values as literal filenames, so the
 * scheme is stripped here. `file::memory:?cache=shared` (and `:memory:`) map to
 * an in-memory database.
 */

export const DEFAULT_DATABASE_URL = "file:./data/hearth.db";

export function resolveDatabasePath(rawUrl?: string): string {
  let value = (rawUrl ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL).trim();

  if (value === "" || value === ":memory:") return ":memory:";

  if (value.startsWith("file:")) {
    value = value.slice("file:".length);
  }

  if (value === "" || value.startsWith("::memory:") || value.startsWith(":memory:")) {
    return ":memory:";
  }

  // Strip any query/fragment (e.g. `?cache=shared`) that is not part of a path.
  const query = value.indexOf("?");
  if (query !== -1) value = value.slice(0, query);

  return value;
}
