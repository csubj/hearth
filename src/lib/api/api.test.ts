import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import "@/lib/api/register-openapi";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import { apiTokens, streamEntries } from "@/db/schema";
import { ensureMetricTablesForTests } from "@/lib/actions/metrics";
import { ensureApiTokensTableForTests, requireApiToken } from "@/lib/api/auth";
import { getOpenApiDocument } from "@/lib/api/openapi";
import { listStreamEntries } from "@/lib/api/resources";
import { createApiTokenForUser } from "@/lib/auth/api-tokens";
import { getOpenModeUsername, isOpenMode } from "@/lib/auth/config";
import { resetLuciaForTests } from "@/lib/auth/lucia";
import { requireAdmin, requireUser, validateRequest } from "@/lib/auth/session";
import { createAdminSession, createTestUser } from "@/lib/auth/test-helpers";

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

function resetTestDb(): void {
  resetDbForTests();
  resetLuciaForTests();
  process.env.DATABASE_URL = ":memory:";
  delete process.env.AUTH_MODE;
  delete process.env.OPEN_MODE_USERNAME;
  migrateTestDb();
  ensureMetricTablesForTests();
  ensureApiTokensTableForTests();
}

function mockCookieJar(): { jar: Map<string, string> } {
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

describe("open mode attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTestDb();
    mockCookieJar();
    process.env.AUTH_MODE = "open";
    process.env.OPEN_MODE_USERNAME = "household";
  });

  it("resolves requireUser to OPEN_MODE_USERNAME without a session", async () => {
    await createTestUser({ username: "household", role: "member" });

    const result = await requireUser();
    expect(result.user.username).toBe("household");
    expect(isOpenMode()).toBe(true);
    expect(getOpenModeUsername()).toBe("household");
  });

  it("validateRequest returns open mode user when no cookie", async () => {
    await createTestUser({ username: "household" });
    const result = await validateRequest();
    expect(result.user?.username).toBe("household");
    expect(result.session).toBeTruthy();
  });
});

describe("admin still gated in open mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTestDb();
    mockCookieJar();
    process.env.AUTH_MODE = "open";
    process.env.OPEN_MODE_USERNAME = "household";
  });

  it("requireAdmin redirects without a real session", async () => {
    await createTestUser({ username: "household", role: "admin" });

    await requireAdmin();
    expect(mockRedirect).toHaveBeenCalledWith("/login?returnTo=/admin");
  });

  it("requireAdmin allows logged-in admin", async () => {
    const { sessionId } = await createAdminSession();
    const { jar } = mockCookieJar();
    jar.set("hearth_session", sessionId);

    const result = await requireAdmin();
    expect(result.user.role).toBe("admin");
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("API bearer auth", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("returns 401 without bearer token", async () => {
    const request = new NextRequest("http://localhost/api/v1/stream");
    const result = await requireApiToken(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("authenticates valid bearer token and updates last_used_at", async () => {
    const user = await createTestUser({ username: "api-owner" });
    const { token, id } = await createApiTokenForUser(user.id, "test");

    const request = new NextRequest("http://localhost/api/v1/stream", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await requireApiToken(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe(user.id);
    }

    const [row] = await getDb().select().from(apiTokens).where(eq(apiTokens.id, id));
    expect(row?.lastUsedAt).toBeTruthy();
  });

  it("returns 401 for revoked token", async () => {
    const user = await createTestUser();
    const { token, id } = await createApiTokenForUser(user.id, "revoked");
    await getDb().update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, id));

    const request = new NextRequest("http://localhost/api/v1/stream", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await requireApiToken(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("lists stream entries after auth setup", async () => {
    const user = await createTestUser();
    await createApiTokenForUser(user.id, "integration");
    const now = new Date();

    await getDb().insert(streamEntries).values({
      id: crypto.randomUUID(),
      body: "hello api",
      isPinned: false,
      doneAt: null,
      roughWhen: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const page = await listStreamEntries({ limit: 50 });
    expect(page.data[0]?.body).toBe("hello api");
  });
});

describe("openapi.json", () => {
  it("returns a valid OpenAPI 3 document with registered paths", () => {
    const doc = getOpenApiDocument() as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.paths["/api/v1/stream"]).toBeDefined();
    expect(doc.paths["/api/v1/metrics/{metricId}/entries"]).toBeDefined();
    expect(doc.components.securitySchemes.bearerAuth).toBeDefined();
  });
});
