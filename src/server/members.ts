/**
 * Active household members (design D6 / tasks 9.1, 9.4, 9.5).
 *
 * "Active" means a non-banned user. Users are disabled, never deleted. Used
 * to resolve `@username` → mention nodes, to validate assignees, and to
 * resolve the assigner's own id when deciding whether an assignment
 * notification is suppressed.
 */

import "server-only";

import { db } from "../db";
import { user as userTable } from "../db/schema";
import { eq } from "drizzle-orm";

export interface ActiveMember {
  id: string;
  username: string;
  name: string;
}

/**
 * The current set of active members as an array. Reads through the shared
 * `db` connection; cheap at household volume.
 */
export function listActiveMembers(): ActiveMember[] {
  const rows = db
    .select({ id: userTable.id, username: userTable.username, name: userTable.name })
    .from(userTable)
    .where(eq(userTable.banned, false))
    .all()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((r): r is ActiveMember => typeof (r as any).username === "string");

  return rows as unknown as ActiveMember[];
}

/**
 * Map of active-member username → user id, for mention resolution.
 */
export function memberByUsername(): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of listActiveMembers()) {
    map.set(m.username, m.id);
  }
  return map;
}
