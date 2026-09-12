import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { homeSpaces, type HomeSpace } from "@/db/schema/home";
import type { AuthUser } from "@/lib/auth/session-store";
import { displayName } from "@/lib/auth/session";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";
import { decodeCursor, paginateRows, type PaginationQuery } from "@/lib/api/pagination";
import { toIso } from "@/lib/api/serialize";
import type { createHomeSpaceSchema, updateHomeSpaceSchema } from "@/lib/api/schemas";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeHomeSpace(row: HomeSpace) {
  return {
    id: row.id,
    parentId: row.parentId,
    kind: row.kind,
    name: row.name,
    address: row.address,
    notes: row.notes,
    sortOrder: row.sortOrder,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

export type HomeSpaceListQuery = PaginationQuery & {
  q?: string;
  kind?: string;
  parentId?: string;
};

export async function listHomeSpacesApi(query: HomeSpaceListQuery) {
  const db = getDb();
  const conditions: SQL[] = [];
  const decoded = query.cursor ? decodeCursor(query.cursor) : null;

  if (decoded) {
    const cursorDate = new Date(decoded.t);
    conditions.push(
      or(
        lt(homeSpaces.updatedAt, cursorDate),
        and(eq(homeSpaces.updatedAt, cursorDate), lt(homeSpaces.id, decoded.id)),
      )!,
    );
  }

  if (query.q) {
    const pattern = `%${query.q.toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(${homeSpaces.name}) like ${pattern}`,
        sql`lower(coalesce(${homeSpaces.address}, '')) like ${pattern}`,
      )!,
    );
  }

  if (query.kind) {
    conditions.push(eq(homeSpaces.kind, query.kind as HomeSpace["kind"]));
  }

  if (query.parentId === "null" || query.parentId === "") {
    conditions.push(sql`${homeSpaces.parentId} IS NULL`);
  } else if (query.parentId) {
    conditions.push(eq(homeSpaces.parentId, query.parentId));
  }

  const rows = await db
    .select()
    .from(homeSpaces)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(homeSpaces.updatedAt), desc(homeSpaces.id))
    .limit(query.limit + 1);

  return paginateRows(rows, query.limit);
}

export async function getHomeSpaceApi(id: string) {
  const [row] = await getDb().select().from(homeSpaces).where(eq(homeSpaces.id, id)).limit(1);
  return row ?? null;
}

export async function createHomeSpaceApi(
  user: AuthUser,
  input: z.infer<typeof createHomeSpaceSchema>,
) {
  const now = new Date();
  const id = crypto.randomUUID();

  await getDb()
    .insert(homeSpaces)
    .values({
      id,
      parentId: input.parentId ?? null,
      kind: input.kind ?? "property",
      name: input.name,
      address: input.address ?? null,
      notes: input.notes ?? null,
      sortOrder: 0,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

  if (input.notes) {
    await emitMentions({
      body: input.notes,
      entityType: "home_space",
      entityId: id,
      actorId: user.id,
    });
  }

  await emitHouseholdActivity({
    type: "home_log.space_created",
    actorId: user.id,
    entityType: "home_space",
    entityId: id,
    summary: `${displayName(user)} added a space to the home log: ${input.name}`,
  });

  return getHomeSpaceApi(id);
}

export async function updateHomeSpaceApi(
  user: AuthUser,
  id: string,
  input: z.infer<typeof updateHomeSpaceSchema>,
) {
  const db = getDb();
  const [existing] = await db.select().from(homeSpaces).where(eq(homeSpaces.id, id)).limit(1);
  if (!existing) return null;

  const now = new Date();
  const patch: Partial<typeof homeSpaces.$inferInsert> = {
    updatedByUserId: user.id,
    updatedAt: now,
  };

  if (input.name !== undefined) patch.name = input.name;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.address !== undefined) patch.address = input.address;
  if (input.notes !== undefined) patch.notes = input.notes;

  await db.update(homeSpaces).set(patch).where(eq(homeSpaces.id, id));

  if (input.notes !== undefined) {
    await emitMentions({
      body: input.notes ?? "",
      entityType: "home_space",
      entityId: id,
      actorId: user.id,
    });
  }

  await emitHouseholdActivity({
    type: "home_log.space_updated",
    actorId: user.id,
    entityType: "home_space",
    entityId: id,
    summary: `${displayName(user)} updated home space: ${patch.name ?? existing.name}`,
  });

  return getHomeSpaceApi(id);
}

export async function deleteHomeSpaceApi(id: string) {
  const db = getDb();
  const [existing] = await db.select().from(homeSpaces).where(eq(homeSpaces.id, id)).limit(1);
  if (!existing) return false;
  await db.delete(homeSpaces).where(eq(homeSpaces.id, id));
  return true;
}
