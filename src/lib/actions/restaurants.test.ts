import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import { restaurants } from "@/db/schema";
import { resetLuciaForTests } from "@/lib/auth/lucia";
import { createTestUser } from "@/lib/auth/test-helpers";
import { create, listRestaurants, markVisited, setRating, update } from "@/lib/actions/restaurants";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@/lib/notifications/emit", () => ({
  emitHouseholdActivity: vi.fn(),
  emitMentions: vi.fn(),
}));

const { requireUser } = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireUser,
    displayName: (user: { displayName: string | null; username: string }) =>
      user.displayName ?? user.username,
  };
});

function setupRestaurantsTable(): void {
  const db = getDb();
  db.run(sql`
    CREATE TABLE IF NOT EXISTS restaurants (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      neighborhood text,
      address text,
      notes text,
      status text NOT NULL DEFAULT 'want_to_try',
      rating integer,
      visit_note text,
      visited_at integer,
      created_by_user_id text NOT NULL REFERENCES users(id),
      updated_by_user_id text NOT NULL REFERENCES users(id),
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    )
  `);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS restaurants_status_created_at_idx ON restaurants (status, created_at)`,
  );
  db.run(sql`CREATE INDEX IF NOT EXISTS restaurants_rating_idx ON restaurants (rating)`);
}

function resetTestDb(): void {
  resetDbForTests();
  resetLuciaForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
  setupRestaurantsTable();
}

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("restaurant actions", () => {
  beforeEach(() => {
    resetTestDb();
    vi.clearAllMocks();
  });

  it("creates a restaurant and emits household activity", async () => {
    const user = await createTestUser({ username: "alice", displayName: "Alice" });
    requireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: user.disabledAt,
      },
      session: { id: "session-1", userId: user.id, expiresAt: new Date() },
    });

    const result = await create(
      {},
      formData({
        name: "Pasta Palace",
        neighborhood: "Downtown",
        notes: "Emily recommended the carbonara",
      }),
    );

    expect(result.error).toBeUndefined();
    expect(result.success).toContain("Pasta Palace");

    const rows = await getDb().select().from(restaurants);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Pasta Palace",
      neighborhood: "Downtown",
      status: "want_to_try",
      createdByUserId: user.id,
    });

    expect(emitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "restaurant.created",
        actorId: user.id,
        entityType: "restaurant",
        summary: "Alice added Pasta Palace",
      }),
    );
    expect(emitMentions).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Emily recommended the carbonara",
        entityType: "restaurant",
        actorId: user.id,
      }),
    );
  });

  it("rejects create without a name", async () => {
    const user = await createTestUser();
    requireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: user.disabledAt,
      },
      session: { id: "session-1", userId: user.id, expiresAt: new Date() },
    });

    const result = await create({}, formData({ name: "" }));
    expect(result.error).toBe("Name is required");
    expect(emitHouseholdActivity).not.toHaveBeenCalled();
  });

  it("updates restaurant details", async () => {
    const user = await createTestUser({ displayName: "Bob" });
    requireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: user.disabledAt,
      },
      session: { id: "session-1", userId: user.id, expiresAt: new Date() },
    });

    await create({}, formData({ name: "Taco Town" }));
    const [created] = await getDb().select().from(restaurants);

    const result = await update(
      {},
      formData({
        id: created!.id,
        name: "Taco Town Deluxe",
        notes: "@alice check this out",
      }),
    );

    expect(result.success).toContain("Taco Town Deluxe");
    const [updated] = await getDb()
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, created!.id));
    expect(updated!.name).toBe("Taco Town Deluxe");
    expect(updated!.notes).toBe("@alice check this out");
    expect(emitMentions).toHaveBeenCalled();
  });

  it("marks a restaurant visited with rating and visit note", async () => {
    const user = await createTestUser({ displayName: "Cara" });
    requireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: user.disabledAt,
      },
      session: { id: "session-1", userId: user.id, expiresAt: new Date() },
    });

    await create({}, formData({ name: "Sushi Spot" }));
    const [created] = await getDb().select().from(restaurants);

    const result = await markVisited(
      {},
      formData({
        id: created!.id,
        rating: "5",
        visitNote: "Best omakase ever",
      }),
    );

    expect(result.success).toContain("visited");
    const [visited] = await getDb()
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, created!.id));
    expect(visited!.status).toBe("visited");
    expect(visited!.rating).toBe(5);
    expect(visited!.visitNote).toBe("Best omakase ever");
    expect(visited!.visitedAt).toBeInstanceOf(Date);

    expect(emitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "restaurant.visited",
        summary: "Cara visited Sushi Spot",
      }),
    );
  });

  it("rejects invalid rating on setRating", async () => {
    const user = await createTestUser();
    requireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: user.disabledAt,
      },
      session: { id: "session-1", userId: user.id, expiresAt: new Date() },
    });

    await create({}, formData({ name: "Burger Barn" }));
    const [created] = await getDb().select().from(restaurants);
    await markVisited({}, formData({ id: created!.id, rating: "3" }));

    const result = await setRating({}, formData({ id: created!.id, rating: "9" }));
    expect(result.error).toBeDefined();
  });

  it("sets rating on visited restaurants", async () => {
    const user = await createTestUser({ displayName: "Dan" });
    requireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: user.disabledAt,
      },
      session: { id: "session-1", userId: user.id, expiresAt: new Date() },
    });

    await create({}, formData({ name: "Pizza Place" }));
    const [created] = await getDb().select().from(restaurants);
    await markVisited({}, formData({ id: created!.id }));

    const result = await setRating({}, formData({ id: created!.id, rating: "4" }));
    expect(result.success).toContain("Rated");

    const [rated] = await getDb().select().from(restaurants).where(eq(restaurants.id, created!.id));
    expect(rated!.rating).toBe(4);
    expect(emitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "restaurant.visited",
        summary: "Dan visited Pizza Place",
      }),
    );
  });

  it("filters restaurants by status and sorts by rating", async () => {
    const user = await createTestUser();
    requireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: user.disabledAt,
      },
      session: { id: "session-1", userId: user.id, expiresAt: new Date() },
    });

    await create({}, formData({ name: "Want A" }));
    await create({}, formData({ name: "Want B" }));
    await create({}, formData({ name: "Visited Low" }));
    const rows = await getDb().select().from(restaurants).orderBy(restaurants.createdAt);
    await markVisited({}, formData({ id: rows[2]!.id, rating: "2" }));
    await create({}, formData({ name: "Visited High" }));
    const allRows = await getDb().select().from(restaurants).orderBy(restaurants.createdAt);
    await markVisited({}, formData({ id: allRows[3]!.id, rating: "5" }));

    const wantToTry = await listRestaurants({ status: "want_to_try" });
    expect(wantToTry).toHaveLength(2);
    expect(wantToTry.every((row) => row.status === "want_to_try")).toBe(true);

    const byRating = await listRestaurants({ status: "visited", sort: "rating" });
    expect(byRating).toHaveLength(2);
    expect(byRating[0]!.name).toBe("Visited High");
    expect(byRating[1]!.name).toBe("Visited Low");
  });
});
