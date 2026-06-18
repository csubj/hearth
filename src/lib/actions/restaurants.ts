"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { restaurants, users, type Restaurant, type RestaurantStatus } from "@/db/schema";
import { displayName, requireUser } from "@/lib/auth/session";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";
import { combineRestaurantMentionText } from "@/lib/restaurants/mention-text";

export type RestaurantActionState = {
  error?: string;
  success?: string;
};

export type RestaurantListItem = Restaurant & {
  addedByName: string;
};

const nameSchema = z.string().trim().min(1, "Name is required").max(200);
const neighborhoodSchema = z.string().trim().max(200).optional();
const addressSchema = z.string().trim().max(500).optional();
const notesSchema = z.string().trim().max(5000).optional();

const createSchema = z.object({
  name: nameSchema,
  neighborhood: neighborhoodSchema,
  address: addressSchema,
  notes: notesSchema,
});

const updateSchema = createSchema.extend({
  id: z.string().uuid(),
  visitNote: z.string().trim().max(5000).optional(),
});

const ratingSchema = z.coerce.number().int().min(1).max(5);

const visitNoteSchema = z.string().trim().max(5000).optional();

const markVisitedSchema = z.object({
  id: z.string().uuid(),
  visitNote: visitNoteSchema,
  rating: ratingSchema.optional(),
});

const setRatingSchema = z.object({
  id: z.string().uuid(),
  rating: ratingSchema,
});

export type RestaurantListFilters = {
  status?: "all" | RestaurantStatus;
  sort?: "created_at" | "rating";
  neighborhood?: string;
  addedBy?: string;
};

function parseListFilters(
  searchParams: Record<string, string | string[] | undefined>,
): RestaurantListFilters {
  const statusParam = typeof searchParams.status === "string" ? searchParams.status : "all";
  const sortParam = typeof searchParams.sort === "string" ? searchParams.sort : "created_at";
  const neighborhoodParam =
    typeof searchParams.neighborhood === "string" ? searchParams.neighborhood : undefined;
  const addedByParam = typeof searchParams.addedBy === "string" ? searchParams.addedBy : undefined;

  const status = statusParam === "want_to_try" || statusParam === "visited" ? statusParam : "all";
  const sort = sortParam === "rating" ? "rating" : "created_at";

  return {
    status,
    sort,
    neighborhood: neighborhoodParam || undefined,
    addedBy: addedByParam || undefined,
  };
}

function toListItem(
  restaurant: Restaurant,
  addedByName: string | null,
  addedByUsername: string,
): RestaurantListItem {
  return {
    ...restaurant,
    addedByName: addedByName ?? addedByUsername,
  };
}

export async function listRestaurantNeighborhoods(): Promise<string[]> {
  await requireUser();
  const rows = await getDb()
    .selectDistinct({ neighborhood: restaurants.neighborhood })
    .from(restaurants)
    .where(sql`${restaurants.neighborhood} IS NOT NULL AND ${restaurants.neighborhood} != ''`)
    .orderBy(restaurants.neighborhood);

  return rows
    .map((row) => row.neighborhood)
    .filter((value): value is string => Boolean(value?.trim()));
}

export async function listRestaurants(
  searchParams: Record<string, string | string[] | undefined> = {},
): Promise<RestaurantListItem[]> {
  await requireUser();
  const { status, sort, neighborhood, addedBy } = parseListFilters(searchParams);
  const db = getDb();

  const conditions = [];
  if (status === "want_to_try" || status === "visited") {
    conditions.push(eq(restaurants.status, status));
  }
  if (neighborhood) {
    conditions.push(eq(restaurants.neighborhood, neighborhood));
  }
  if (addedBy) {
    conditions.push(eq(restaurants.createdByUserId, addedBy));
  }

  const orderBy =
    sort === "rating"
      ? [sql`${restaurants.rating} IS NULL`, desc(restaurants.rating), desc(restaurants.createdAt)]
      : [desc(restaurants.createdAt)];

  const rows = await db
    .select({
      restaurant: restaurants,
      addedByName: users.displayName,
      addedByUsername: users.username,
    })
    .from(restaurants)
    .innerJoin(users, eq(restaurants.createdByUserId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...orderBy);

  return rows.map((row) => toListItem(row.restaurant, row.addedByName, row.addedByUsername));
}

export async function getRestaurantById(id: string): Promise<Restaurant | undefined> {
  await requireUser();
  const [row] = await getDb().select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  return row;
}

export async function getWantToTryPreview(limit = 5): Promise<Restaurant[]> {
  await requireUser();
  return getDb()
    .select()
    .from(restaurants)
    .where(eq(restaurants.status, "want_to_try"))
    .orderBy(desc(restaurants.createdAt))
    .limit(limit);
}

export async function getRestaurantsHomeStats(): Promise<{ wantToTry: number }> {
  await requireUser();
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(restaurants)
    .where(eq(restaurants.status, "want_to_try"));
  return { wantToTry: row?.count ?? 0 };
}

export async function create(
  _prev: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const { user } = await requireUser();

  const parsed = createSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    neighborhood: String(formData.get("neighborhood") ?? "") || undefined,
    address: String(formData.get("address") ?? "") || undefined,
    notes: String(formData.get("notes") ?? "") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const data = parsed.data;

  await getDb()
    .insert(restaurants)
    .values({
      id,
      name: data.name,
      neighborhood: data.neighborhood ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      status: "want_to_try",
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "restaurant.created",
    actorId: user.id,
    entityType: "restaurant",
    entityId: id,
    summary: `${actor} added ${data.name}`,
  });

  if (data.notes) {
    await emitMentions({
      body: data.notes,
      entityType: "restaurant",
      entityId: id,
      actorId: user.id,
    });
  }

  revalidatePath("/");
  revalidatePath("/restaurants");
  return { success: `Added "${data.name}"` };
}

export async function update(
  _prev: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const { user } = await requireUser();

  const parsed = updateSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? ""),
    neighborhood: String(formData.get("neighborhood") ?? "") || undefined,
    address: String(formData.get("address") ?? "") || undefined,
    notes: String(formData.get("notes") ?? "") || undefined,
    visitNote: String(formData.get("visitNote") ?? "") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, data.id))
    .limit(1);

  if (!existing) {
    return { error: "Restaurant not found" };
  }

  const now = new Date();
  const visitNote =
    existing.status === "visited" ? (data.visitNote ?? existing.visitNote) : existing.visitNote;

  const updated = await db
    .update(restaurants)
    .set({
      name: data.name,
      neighborhood: data.neighborhood ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      visitNote: existing.status === "visited" ? (visitNote ?? null) : existing.visitNote,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(restaurants.id, data.id))
    .returning({ id: restaurants.id, name: restaurants.name });

  if (updated.length === 0) {
    return { error: "Restaurant not found" };
  }

  await emitMentions({
    body: combineRestaurantMentionText(data.notes, visitNote),
    entityType: "restaurant",
    entityId: data.id,
    actorId: user.id,
  });

  revalidatePath("/");
  revalidatePath("/restaurants");
  revalidatePath(`/restaurants/${data.id}`);
  return { success: `Updated "${updated[0]!.name}"` };
}

export async function markVisited(
  _prev: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const { user } = await requireUser();

  const parsed = markVisitedSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    visitNote: String(formData.get("visitNote") ?? "") || undefined,
    rating: String(formData.get("rating") ?? "") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const existing = await getRestaurantById(data.id);
  if (!existing) {
    return { error: "Restaurant not found" };
  }

  const now = new Date();
  const visitNote = data.visitNote ?? null;

  const updated = await getDb()
    .update(restaurants)
    .set({
      status: "visited",
      visitedAt: now,
      visitNote,
      rating: data.rating ?? null,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(and(eq(restaurants.id, data.id), eq(restaurants.status, "want_to_try")))
    .returning({ id: restaurants.id, name: restaurants.name });

  if (updated.length === 0) {
    return { error: "Restaurant is already marked as visited" };
  }

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "restaurant.visited",
    actorId: user.id,
    entityType: "restaurant",
    entityId: data.id,
    summary: `${actor} visited ${updated[0]!.name}`,
  });

  await emitMentions({
    body: combineRestaurantMentionText(existing.notes, visitNote),
    entityType: "restaurant",
    entityId: data.id,
    actorId: user.id,
  });

  revalidatePath("/");
  revalidatePath("/restaurants");
  revalidatePath(`/restaurants/${data.id}`);
  return { success: `Marked "${updated[0]!.name}" as visited` };
}

export async function setRating(
  _prev: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const { user } = await requireUser();

  const parsed = setRatingSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    rating: formData.get("rating"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const existing = await getRestaurantById(data.id);
  if (!existing) {
    return { error: "Restaurant not found" };
  }
  if (existing.status !== "visited") {
    return { error: "Rating can only be set on visited restaurants" };
  }

  const now = new Date();

  const updated = await getDb()
    .update(restaurants)
    .set({
      rating: data.rating,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(and(eq(restaurants.id, data.id), eq(restaurants.status, "visited")))
    .returning({ id: restaurants.id, name: restaurants.name });

  if (updated.length === 0) {
    return { error: "Restaurant not found" };
  }

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "restaurant.rated",
    actorId: user.id,
    entityType: "restaurant",
    entityId: data.id,
    summary: `${actor} rated ${updated[0]!.name} ${data.rating} stars`,
  });

  await emitMentions({
    body: combineRestaurantMentionText(existing.notes, existing.visitNote),
    entityType: "restaurant",
    entityId: data.id,
    actorId: user.id,
  });

  revalidatePath("/");
  revalidatePath("/restaurants");
  revalidatePath(`/restaurants/${data.id}`);
  return { success: `Rated "${updated[0]!.name}"` };
}
