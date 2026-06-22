import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import {
  homeItems,
  homeLinks,
  homeSpaces,
  inventoryItems,
  maintenanceLogs,
  projects,
} from "@/db/schema";
import { resetLuciaForTests } from "@/lib/auth/lucia";
import { createTestUser } from "@/lib/auth/test-helpers";
import { ensureApiTokensTableForTests } from "@/lib/api/auth";
import { createApiTokenForUser } from "@/lib/auth/api-tokens";
import {
  createHomeItemApi,
  createHomeSpaceApi,
  deleteHomeItemApi,
  deleteHomeSpaceApi,
  getHomeItemApi,
  getHomeSpaceApi,
  listHomeItemsApi,
  listHomeSpacesApi,
  serializeHomeItem,
  serializeHomeSpace,
  updateHomeItemApi,
  updateHomeSpaceApi,
} from "@/lib/api/home-resources";
import {
  createHomeLink,
  createHomeSpace,
  getHomeRoots,
  getHomeSpaceById,
  getHomeTree,
  getHomeLogHomeStats,
  linkHomeEntity,
  unlinkHomeEntity,
  listHomeReferencesForTarget,
  removeHomeLinksForTarget,
} from "@/lib/actions/home";
import { maybeAutoLinkToHome } from "@/lib/home/auto-link";
import { normalizeColorHex, isValidColorHex } from "@/lib/home/item-presets";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

const mockCookies = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => mockCookies(),
  headers: vi.fn(),
}));

function mockCookieJar() {
  const jar = new Map<string, string>();
  mockCookies.mockResolvedValue({
    get: (name: string) => {
      const value = jar.get(name);
      return value ? { name, value } : undefined;
    },
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  });
  return { jar };
}

function resetTestDb(): void {
  resetDbForTests();
  resetLuciaForTests();
  process.env.DATABASE_URL = ":memory:";
  delete process.env.AUTH_MODE;
  delete process.env.OPEN_MODE_USERNAME;
  migrateTestDb();
  ensureApiTokensTableForTests();
}

describe("normalizeColorHex", () => {
  it("normalizes 6-char hex with #", () => {
    expect(normalizeColorHex("#f5f0e8")).toBe("#F5F0E8");
  });

  it("normalizes 6-char hex without #", () => {
    expect(normalizeColorHex("f5f0e8")).toBe("#F5F0E8");
  });

  it("expands 3-char hex", () => {
    expect(normalizeColorHex("abc")).toBe("#AABBCC");
    expect(normalizeColorHex("#abc")).toBe("#AABBCC");
  });

  it("returns null for invalid hex", () => {
    expect(normalizeColorHex("not-a-color")).toBeNull();
    expect(normalizeColorHex("gggggg")).toBeNull();
    expect(normalizeColorHex("12345")).toBeNull();
  });
});

describe("isValidColorHex", () => {
  it("returns true for valid hex", () => {
    expect(isValidColorHex("#FFFFFF")).toBe(true);
    expect(isValidColorHex("abc")).toBe(true);
  });

  it("returns false for invalid hex", () => {
    expect(isValidColorHex("zzzzzz")).toBe(false);
    expect(isValidColorHex("")).toBe(false);
  });
});

describe("home log API resources (spaces)", () => {
  beforeEach(() => {
    resetTestDb();
    process.env.AUTH_MODE = "open";
    process.env.OPEN_MODE_USERNAME = "household";
    mockCookieJar();
  });

  it("creates, reads, updates, and deletes a space", async () => {
    const user = await createTestUser({ username: "household", role: "member" });
    await createApiTokenForUser(user.id, "test");

    const space = await createHomeSpaceApi(user, {
      name: "Main house",
      kind: "property",
      address: "123 Main St",
    });
    expect(space).not.toBeNull();
    expect(space?.name).toBe("Main house");
    expect(space?.kind).toBe("property");
    expect(space?.address).toBe("123 Main St");

    const fetched = await getHomeSpaceApi(space!.id);
    expect(fetched?.id).toBe(space!.id);

    const updated = await updateHomeSpaceApi(user, space!.id, { name: "Big house" });
    expect(updated?.name).toBe("Big house");

    const serialized = serializeHomeSpace(updated!);
    expect(serialized.name).toBe("Big house");
    expect(serialized.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/);

    const deleted = await deleteHomeSpaceApi(space!.id);
    expect(deleted).toBe(true);

    const gone = await getHomeSpaceApi(space!.id);
    expect(gone).toBeNull();
  });

  it("lists spaces with parentId filter", async () => {
    const user = await createTestUser({ username: "household", role: "member" });

    const parent = await createHomeSpaceApi(user, { name: "House", kind: "property" });
    await createHomeSpaceApi(user, { name: "Kitchen", kind: "room", parentId: parent!.id });
    await createHomeSpaceApi(user, { name: "Garage", kind: "structure" });

    const all = await listHomeSpacesApi({ limit: 50 });
    expect(all.data).toHaveLength(3);

    const children = await listHomeSpacesApi({ limit: 50, parentId: parent!.id });
    expect(children.data).toHaveLength(1);
    expect(children.data[0]?.name).toBe("Kitchen");

    const roots = await listHomeSpacesApi({ limit: 50, parentId: "null" });
    expect(roots.data.some((s) => s.name === "House")).toBe(true);
    expect(roots.data.some((s) => s.name === "Garage")).toBe(true);
  });
});

describe("home log API resources (items)", () => {
  beforeEach(() => {
    resetTestDb();
    process.env.AUTH_MODE = "open";
    process.env.OPEN_MODE_USERNAME = "household";
    mockCookieJar();
  });

  it("creates, reads, updates, and deletes an item", async () => {
    const user = await createTestUser({ username: "household", role: "member" });

    const space = await createHomeSpaceApi(user, { name: "Living room", kind: "room" });

    const item = await createHomeItemApi(user, {
      spaceId: space!.id,
      kind: "paint",
      name: "Wall paint",
      manufacturer: "Benjamin Moore",
      colorName: "Chantilly Lace",
      colorHex: "f5f0e8",
    });
    expect(item).not.toBeNull();
    expect(item?.kind).toBe("paint");
    expect(item?.colorHex).toBe("#F5F0E8");

    const serialized = serializeHomeItem(item!);
    expect(serialized.colorHex).toBe("#F5F0E8");

    const patched = await updateHomeItemApi(user, item!.id, { name: "Ceiling paint" });
    expect(patched?.name).toBe("Ceiling paint");

    const deleted = await deleteHomeItemApi(item!.id);
    expect(deleted).toBe(true);

    const gone = await getHomeItemApi(item!.id);
    expect(gone).toBeNull();
  });

  it("lists items with spaceId and kind filters", async () => {
    const user = await createTestUser({ username: "household", role: "member" });
    const space = await createHomeSpaceApi(user, { name: "Kitchen", kind: "room" });

    await createHomeItemApi(user, { spaceId: space!.id, kind: "appliance", name: "Refrigerator" });
    await createHomeItemApi(user, { spaceId: space!.id, kind: "paint", name: "Cabinet paint" });

    const all = await listHomeItemsApi({ limit: 50 });
    expect(all.data).toHaveLength(2);

    const appliances = await listHomeItemsApi({ limit: 50, kind: "appliance" });
    expect(appliances.data).toHaveLength(1);
    expect(appliances.data[0]?.name).toBe("Refrigerator");

    const forSpace = await listHomeItemsApi({ limit: 50, spaceId: space!.id });
    expect(forSpace.data).toHaveLength(2);
  });
});

describe("home log server actions (read loaders)", () => {
  beforeEach(() => {
    resetTestDb();
    process.env.AUTH_MODE = "open";
    process.env.OPEN_MODE_USERNAME = "household";
    mockCookieJar();
  });

  it("getHomeRoots returns top-level spaces only", async () => {
    const user = await createTestUser({ username: "household", role: "member" });

    const now = new Date();
    const propId = crypto.randomUUID();
    const roomId = crypto.randomUUID();
    await getDb()
      .insert(homeSpaces)
      .values([
        {
          id: propId,
          parentId: null,
          kind: "property",
          name: "Main house",
          address: null,
          notes: null,
          sortOrder: 0,
          createdByUserId: user.id,
          updatedByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: roomId,
          parentId: propId,
          kind: "room",
          name: "Kitchen",
          address: null,
          notes: null,
          sortOrder: 0,
          createdByUserId: user.id,
          updatedByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        },
      ]);

    const roots = await getHomeRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0]?.name).toBe("Main house");
  });

  it("getHomeSpaceById returns space with breadcrumb and items", async () => {
    const user = await createTestUser({ username: "household", role: "member" });
    const now = new Date();

    const propId = crypto.randomUUID();
    const roomId = crypto.randomUUID();
    const itemId = crypto.randomUUID();

    await getDb()
      .insert(homeSpaces)
      .values([
        {
          id: propId,
          parentId: null,
          kind: "property",
          name: "House",
          address: null,
          notes: null,
          sortOrder: 0,
          createdByUserId: user.id,
          updatedByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: roomId,
          parentId: propId,
          kind: "room",
          name: "Kitchen",
          address: null,
          notes: null,
          sortOrder: 0,
          createdByUserId: user.id,
          updatedByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    await getDb().insert(homeItems).values({
      id: itemId,
      spaceId: roomId,
      kind: "appliance",
      name: "Dishwasher",
      manufacturer: null,
      modelNumber: null,
      serialNumber: null,
      colorName: null,
      colorHex: null,
      finish: null,
      productUrl: null,
      purchasedAt: null,
      notes: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const detail = await getHomeSpaceById(roomId);
    expect(detail).not.toBeNull();
    expect(detail?.name).toBe("Kitchen");
    expect(detail?.breadcrumb).toHaveLength(2);
    expect(detail?.breadcrumb[0]?.name).toBe("House");
    expect(detail?.breadcrumb[1]?.name).toBe("Kitchen");
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0]?.name).toBe("Dishwasher");
  });

  it("getHomeTree returns nested spaces with items and resolved links", async () => {
    const user = await createTestUser({ username: "household", role: "member" });
    const now = new Date();

    const propId = crypto.randomUUID();
    const roomId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const inventoryId = crypto.randomUUID();
    const maintenanceId = crypto.randomUUID();
    const projectId = crypto.randomUUID();

    await getDb()
      .insert(homeSpaces)
      .values([
        {
          id: propId,
          parentId: null,
          kind: "property",
          name: "House",
          address: null,
          notes: null,
          sortOrder: 0,
          createdByUserId: user.id,
          updatedByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: roomId,
          parentId: propId,
          kind: "room",
          name: "Kitchen",
          address: null,
          notes: null,
          sortOrder: 0,
          createdByUserId: user.id,
          updatedByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    await getDb().insert(homeItems).values({
      id: itemId,
      spaceId: roomId,
      kind: "paint",
      name: "Cabinet paint",
      manufacturer: null,
      modelNumber: null,
      serialNumber: null,
      colorName: null,
      colorHex: null,
      finish: null,
      productUrl: null,
      purchasedAt: null,
      notes: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await getDb().insert(inventoryItems).values({
      id: inventoryId,
      name: "Dish soap",
      brand: null,
      model: null,
      serial: null,
      itemType: null,
      location: null,
      purchaseDate: null,
      store: null,
      price: null,
      warrantyNote: null,
      notes: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await getDb().insert(maintenanceLogs).values({
      id: maintenanceId,
      title: "Fix faucet",
      notes: null,
      category: null,
      company: null,
      costCents: null,
      startedAt: null,
      completedAt: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await getDb().insert(projects).values({
      id: projectId,
      title: "Kitchen refresh",
      notes: null,
      status: "idea",
      priority: null,
      targetWhen: null,
      budgetCents: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await getDb()
      .insert(homeLinks)
      .values([
        {
          id: crypto.randomUUID(),
          sourceType: "home_space",
          sourceId: roomId,
          targetType: "inventory_item",
          targetId: inventoryId,
          createdByUserId: user.id,
          createdAt: now,
        },
        {
          id: crypto.randomUUID(),
          sourceType: "home_space",
          sourceId: roomId,
          targetType: "maintenance_log",
          targetId: maintenanceId,
          createdByUserId: user.id,
          createdAt: now,
        },
        {
          id: crypto.randomUUID(),
          sourceType: "home_space",
          sourceId: roomId,
          targetType: "project",
          targetId: projectId,
          createdByUserId: user.id,
          createdAt: now,
        },
      ]);

    const tree = await getHomeTree();
    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("House");
    expect(tree[0]?.children).toHaveLength(1);
    const kitchen = tree[0]?.children[0];
    expect(kitchen?.name).toBe("Kitchen");
    expect(kitchen?.items).toEqual([
      expect.objectContaining({ id: itemId, name: "Cabinet paint", kind: "paint" }),
    ]);
    expect(kitchen?.inventory).toEqual([{ id: inventoryId, name: "Dish soap" }]);
    expect(kitchen?.maintenance).toEqual([{ id: maintenanceId, title: "Fix faucet" }]);
    expect(kitchen?.projects).toEqual([{ id: projectId, title: "Kitchen refresh" }]);
  });

  it("getHomeLogHomeStats returns correct counts", async () => {
    const user = await createTestUser({ username: "household", role: "member" });
    const now = new Date();
    const spaceId = crypto.randomUUID();

    await getDb().insert(homeSpaces).values({
      id: spaceId,
      parentId: null,
      kind: "property",
      name: "Cabin",
      address: null,
      notes: null,
      sortOrder: 0,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await getDb().insert(homeItems).values({
      id: crypto.randomUUID(),
      spaceId,
      kind: "generic",
      name: "Shovel",
      manufacturer: null,
      modelNumber: null,
      serialNumber: null,
      colorName: null,
      colorHex: null,
      finish: null,
      productUrl: null,
      purchasedAt: null,
      notes: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const stats = await getHomeLogHomeStats();
    expect(stats.totalSpaces).toBe(1);
    expect(stats.totalItems).toBe(1);
  });
});

describe("home links (cross-entity)", () => {
  beforeEach(() => {
    resetTestDb();
    process.env.AUTH_MODE = "open";
    process.env.OPEN_MODE_USERNAME = "household";
    mockCookieJar();
  });

  it("links and unlinks a space to a maintenance log", async () => {
    const user = await createTestUser({ username: "household", role: "member" });
    const now = new Date();

    const spaceId = crypto.randomUUID();
    await getDb().insert(homeSpaces).values({
      id: spaceId,
      parentId: null,
      kind: "room",
      name: "Boiler room",
      address: null,
      notes: null,
      sortOrder: 0,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const targetId = crypto.randomUUID();

    const linkFormData = new FormData();
    linkFormData.append("sourceType", "home_space");
    linkFormData.append("sourceId", spaceId);
    linkFormData.append("targetType", "maintenance_log");
    linkFormData.append("targetId", targetId);

    const linkResult = await linkHomeEntity({}, linkFormData);
    expect(linkResult.success).toBe("Linked");

    const links = await getDb().select().from(homeLinks);
    expect(links).toHaveLength(1);
    expect(links[0]?.sourceId).toBe(spaceId);
    expect(links[0]?.targetType).toBe("maintenance_log");

    // Idempotent: linking again doesn't create duplicate
    await linkHomeEntity({}, linkFormData);
    const linksAfterDupe = await getDb().select().from(homeLinks);
    expect(linksAfterDupe).toHaveLength(1);

    const unlinkFormData = new FormData();
    unlinkFormData.append("sourceType", "home_space");
    unlinkFormData.append("sourceId", spaceId);
    unlinkFormData.append("targetType", "maintenance_log");
    unlinkFormData.append("targetId", targetId);

    const unlinkResult = await unlinkHomeEntity({}, unlinkFormData);
    expect(unlinkResult.success).toBe("Unlinked");
    expect(await getDb().select().from(homeLinks)).toHaveLength(0);
  });

  it("listHomeReferencesForTarget finds back-links", async () => {
    const user = await createTestUser({ username: "household", role: "member" });
    const now = new Date();
    const spaceId = crypto.randomUUID();
    const targetId = crypto.randomUUID();

    await getDb().insert(homeSpaces).values({
      id: spaceId,
      parentId: null,
      kind: "room",
      name: "Bathroom",
      address: null,
      notes: null,
      sortOrder: 0,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await getDb().insert(homeLinks).values({
      id: crypto.randomUUID(),
      sourceType: "home_space",
      sourceId: spaceId,
      targetType: "project",
      targetId,
      createdByUserId: user.id,
      createdAt: now,
    });

    const refs = await listHomeReferencesForTarget("project", targetId);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.sourceName).toBe("Bathroom");
    expect(refs[0]?.sourceType).toBe("home_space");
  });

  it("removeHomeLinksForTarget removes all links to a target", async () => {
    const user = await createTestUser({ username: "household", role: "member" });
    const now = new Date();
    const spaceId = crypto.randomUUID();
    const targetId = crypto.randomUUID();

    await getDb().insert(homeSpaces).values({
      id: spaceId,
      parentId: null,
      kind: "property",
      name: "Main",
      address: null,
      notes: null,
      sortOrder: 0,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await getDb().insert(homeLinks).values({
      id: crypto.randomUUID(),
      sourceType: "home_space",
      sourceId: spaceId,
      targetType: "maintenance_log",
      targetId,
      createdByUserId: user.id,
      createdAt: now,
    });

    expect(await getDb().select().from(homeLinks)).toHaveLength(1);
    await removeHomeLinksForTarget("maintenance_log", targetId);
    expect(await getDb().select().from(homeLinks)).toHaveLength(0);
  });
});

describe("createHomeSpace dialog mode", () => {
  beforeEach(() => {
    resetTestDb();
    process.env.AUTH_MODE = "open";
    process.env.OPEN_MODE_USERNAME = "household";
    mockCookieJar();
    mockRedirect.mockClear();
  });

  it("returns success + id without redirecting when redirect=none", async () => {
    await createTestUser({ username: "household", role: "member" });

    const formData = new FormData();
    formData.append("name", "Cabin");
    formData.append("kind", "property");
    formData.append("redirect", "none");

    const result = await createHomeSpace({}, formData);

    expect(result.error).toBeUndefined();
    expect(result.id).toBeTruthy();
    expect(result.success).toContain("Cabin");
    expect(mockRedirect).not.toHaveBeenCalled();

    const spaces = await getDb().select().from(homeSpaces);
    expect(spaces).toHaveLength(1);
    expect(spaces[0]?.name).toBe("Cabin");
  });

  it("redirects to the detail page by default", async () => {
    await createTestUser({ username: "household", role: "member" });

    const formData = new FormData();
    formData.append("name", "Main house");
    formData.append("kind", "property");

    await createHomeSpace({}, formData);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect.mock.calls[0]?.[0]).toMatch(/^\/home-log\//);
  });
});

describe("maybeAutoLinkToHome", () => {
  beforeEach(() => {
    resetTestDb();
    process.env.AUTH_MODE = "open";
    process.env.OPEN_MODE_USERNAME = "household";
    mockCookieJar();
  });

  it("creates a home_link when source context is present", async () => {
    const user = await createTestUser({ username: "household", role: "member" });
    const now = new Date();
    const spaceId = crypto.randomUUID();
    await getDb().insert(homeSpaces).values({
      id: spaceId,
      parentId: null,
      kind: "room",
      name: "Garage",
      address: null,
      notes: null,
      sortOrder: 0,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const targetId = crypto.randomUUID();
    const formData = new FormData();
    formData.append("homeLinkSourceType", "home_space");
    formData.append("homeLinkSourceId", spaceId);

    await maybeAutoLinkToHome(formData, "project", targetId, user.id);

    const links = await getDb().select().from(homeLinks);
    expect(links).toHaveLength(1);
    expect(links[0]?.sourceId).toBe(spaceId);
    expect(links[0]?.targetType).toBe("project");
    expect(links[0]?.targetId).toBe(targetId);
  });

  it("is a no-op without source context", async () => {
    const user = await createTestUser({ username: "household", role: "member" });

    const formData = new FormData();
    await maybeAutoLinkToHome(formData, "project", crypto.randomUUID(), user.id);

    expect(await getDb().select().from(homeLinks)).toHaveLength(0);
  });

  it("createHomeLink is idempotent", async () => {
    const user = await createTestUser({ username: "household", role: "member" });
    const now = new Date();
    const spaceId = crypto.randomUUID();
    await getDb().insert(homeSpaces).values({
      id: spaceId,
      parentId: null,
      kind: "room",
      name: "Shed",
      address: null,
      notes: null,
      sortOrder: 0,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    const targetId = crypto.randomUUID();

    await createHomeLink({
      sourceType: "home_space",
      sourceId: spaceId,
      targetType: "inventory_item",
      targetId,
      userId: user.id,
    });
    await createHomeLink({
      sourceType: "home_space",
      sourceId: spaceId,
      targetType: "inventory_item",
      targetId,
      userId: user.id,
    });

    expect(await getDb().select().from(homeLinks)).toHaveLength(1);
  });
});

describe("openapi includes home log paths", () => {
  it("home spaces and items are registered in the OpenAPI spec", async () => {
    await import("@/lib/api/register-openapi");
    const { getOpenApiDocument } = await import("@/lib/api/openapi");
    const doc = getOpenApiDocument() as { paths: Record<string, unknown> };
    expect(doc.paths["/api/v1/home/spaces"]).toBeDefined();
    expect(doc.paths["/api/v1/home/spaces/{id}"]).toBeDefined();
    expect(doc.paths["/api/v1/home/items"]).toBeDefined();
    expect(doc.paths["/api/v1/home/items/{id}"]).toBeDefined();
  });
});
