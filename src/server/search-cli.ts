/**
 * CLI entry point for `pnpm search:rebuild` (design D10, task 12.2).
 *
 * Clears and rebuilds the entire FTS5 `search_index` from the current
 * `entities` table, then runs a consistency repair for any drift. Intended
 * for when the index is known to be corrupt or the search:rebuild script is
 * invoked manually. Prefer the daily consistency job for routine repairs.
 */

import { sqlite } from "../db";
import { rebuildAllIndex, checkSearchConsistency } from "../db/search";

const rebuilt = rebuildAllIndex(sqlite);
const repaired = checkSearchConsistency(sqlite);

console.log(`✓ search index rebuilt: ${rebuilt} row(s)`);
if (repaired > 0) {
  console.log(`✓ consistency repair: ${repaired} row(s)`);
}
process.exit(0);
