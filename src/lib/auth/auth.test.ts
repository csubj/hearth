import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, count, eq } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import { notifications, users } from "@/db/schema";
import { getLucia, resetLuciaForTests } from "@/lib/auth/lucia";
import { verifyPassword } from "@/lib/auth/password";
import { canDemoteAdmin, canDisableUser } from "@/lib/auth/admin-guards";
import { login } from "@/lib/actions/auth";
import {
  createUser,
  demoteFromAdmin,
  disableUser,
} from "@/lib/actions/admin/users";
import {
  createAdminSession,
  createTestUser,
  getUserByUsername,
  loginAs,
} from "@/lib/auth/test-helpers";
import { validateApiSession } from "@/lib/attachments/auth";
import { requireAdmin } from "@/lib/auth/session";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

const mockHeaders = vi.fn();
const mockCookies = vi.fn();
vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
  cookies: () => mockCookies(),
}));

function resetTestDb(): void {
  resetDbForTests();
  resetLuciaForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
}

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

function mockRequestHeaders(ip = "203.0.113.10"): void {
  mockHeaders.mockResolvedValue({
    get: (name: string) => {
      if (name === "x-forwarded-for") return ip;
      if (name === "x-real-ip") return null;
      return null;
    },
  });
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

describe("auth login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTestDb();
    mockRequestHeaders();
    mockCookieJar();
  });

  it("creates a user with hashed password and valid login session", async () => {
    const user = await createTestUser({ username: "alice", password: "password123" });
    const stored = await getUserByUsername("alice");

    expect(stored).toBeDefined();
    expect(stored!.passwordHash).not.toBe("password123");
    expect(await verifyPassword("password123", stored!.passwordHash)).toBe(true);

    const sessionId = await loginAs(user.id);
    const result = await getLucia().validateSession(sessionId);
    expect(result.user?.id).toBe(user.id);
    expect(result.session?.id).toBe(sessionId);
  });

  it("rejects login with invalid credentials", async () => {
    await createTestUser({ username: "alice", password: "password123" });

    const result = await login({}, formData({ username: "alice", password: "wrong-password" }));

    expect(result).toEqual({ error: "Invalid username or password" });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("rejects login for unknown usernames without revealing absence", async () => {
    const result = await login(
      {},
      formData({ username: "nobody", password: "password123" }),
    );

    expect(result).toEqual({ error: "Invalid username or password" });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("rejects login for disabled users", async () => {
    await createTestUser({
      username: "disabled",
      password: "password123",
      disabledAt: new Date(),
    });

    const result = await login(
      {},
      formData({ username: "disabled", password: "password123" }),
    );

    expect(result).toEqual({ error: "Invalid username or password" });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("invalidates sessions when user is disabled", async () => {
    const user = await createTestUser({ username: "disabled" });
    const sessionId = await loginAs(user.id);

    await getDb().update(users).set({ disabledAt: new Date() }).where(eq(users.id, user.id));
    await getLucia().invalidateUserSessions(user.id);

    const result = await getLucia().validateSession(sessionId);
    expect(result.user).toBeNull();
    expect(result.session).toBeNull();
  });

  it("validateApiSession invalidates disabled users", async () => {
    const user = await createTestUser({ username: "apiuser" });
    const sessionId = await loginAs(user.id);
    const lucia = getLucia();
    const { jar } = mockCookieJar();
    jar.set(lucia.sessionCookieName, sessionId);

    await getDb().update(users).set({ disabledAt: new Date() }).where(eq(users.id, user.id));

    const result = await validateApiSession();
    expect(result.user).toBeNull();
    expect(result.session).toBeNull();

    const sessionCheck = await lucia.validateSession(sessionId);
    expect(sessionCheck.user).toBeNull();
    expect(sessionCheck.session).toBeNull();
  });
});

describe("admin guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTestDb();
    mockRequestHeaders();
    mockCookieJar();
  });

  it("member user has member role", async () => {
    const user = await createTestUser({ role: "member" });
    const sessionId = await loginAs(user.id);
    const { user: authUser } = await getLucia().validateSession(sessionId);
    expect(authUser?.role).toBe("member");
  });

  it("admin user has admin role", async () => {
    const { user, sessionId } = await createAdminSession();
    const { user: authUser } = await getLucia().validateSession(sessionId);
    expect(authUser?.role).toBe("admin");
    expect(authUser?.id).toBe(user.id);
  });

  it("blocks disabling the last active admin", async () => {
    const db = getDb();
    const { user } = await createAdminSession();
    const guard = canDisableUser(db, user, user.id);
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.error).toMatch(/last.*admin/i);
    }
  });

  it("allows disabling admin when another admin exists", async () => {
    const db = getDb();
    await createAdminSession();
    const second = await createTestUser({ username: "admin2", role: "admin" });
    const guard = canDisableUser(db, second, second.id);
    expect(guard.ok).toBe(true);
  });

  it("blocks demoting the last active admin", async () => {
    const db = getDb();
    const { user } = await createAdminSession();
    const guard = canDemoteAdmin(db, user, user.id);
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.error).toMatch(/last.*admin/i);
    }
  });

  it("denies admin actions to members via requireAdmin", async () => {
    const member = await createTestUser({ username: "member", role: "member" });
    const sessionId = await loginAs(member.id);
    const lucia = getLucia();
    const { jar } = mockCookieJar();
    jar.set(lucia.sessionCookieName, sessionId);

    await requireAdmin();
    expect(mockRedirect).toHaveBeenCalledWith("/?error=Admin access required");
  });

  it("disableUser rejects disabling the last admin", async () => {
    const { user: admin, sessionId } = await createAdminSession();
    const lucia = getLucia();
    const { jar } = mockCookieJar();
    jar.set(lucia.sessionCookieName, sessionId);

    const result = await disableUser({}, formData({ userId: admin.id }));

    expect(result.error).toMatch(/last.*admin/i);
  });

  it("demoteFromAdmin rejects demoting the last admin", async () => {
    const { user: admin, sessionId } = await createAdminSession();
    const lucia = getLucia();
    const { jar } = mockCookieJar();
    jar.set(lucia.sessionCookieName, sessionId);

    const result = await demoteFromAdmin({}, formData({ userId: admin.id }));

    expect(result.error).toMatch(/last.*admin/i);
  });
});

describe("admin audit notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTestDb();
    mockRequestHeaders();
    mockCookieJar();
  });

  it("emits user.admin_action when an admin creates a user", async () => {
    const { user: admin, sessionId } = await createAdminSession();
    const lucia = getLucia();
    const { jar } = mockCookieJar();
    jar.set(lucia.sessionCookieName, sessionId);

    const result = await createUser(
      {},
      formData({
        username: "newbie",
        password: "password123",
        role: "member",
      }),
    );

    expect(result.success).toMatch(/created/i);

    const rows = await getDb()
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.type, "user.admin_action"), eq(notifications.actorUserId, admin.id)),
      );
    expect(rows).toHaveLength(0);
  });

  it("emits user.admin_action to other admins", async () => {
    const { user: admin, sessionId } = await createAdminSession();
    const otherAdmin = await createTestUser({ username: "admin2", role: "admin" });
    const lucia = getLucia();
    const { jar } = mockCookieJar();
    jar.set(lucia.sessionCookieName, sessionId);

    await createUser(
      {},
      formData({
        username: "newbie",
        password: "password123",
        role: "member",
      }),
    );

    const rows = await getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.type, "user.admin_action"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.recipientUserId).toBe(otherAdmin.id);
    expect(rows[0]!.actorUserId).toBe(admin.id);
    expect(rows[0]!.summary).toContain("created user @newbie");
  });
});

describe("bootstrap idempotency", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("refuses bootstrap when users already exist", async () => {
    await createTestUser();
    const [row] = await getDb().select({ value: count() }).from(users);
    expect(row?.value).toBe(1);
  });
});
