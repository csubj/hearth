import { beforeEach, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import { users } from "@/db/schema";
import { getLucia, resetLuciaForTests } from "@/lib/auth/lucia";
import { verifyPassword } from "@/lib/auth/password";
import { canDisableUser } from "@/lib/auth/admin-guards";
import {
  createAdminSession,
  createTestUser,
  getUserByUsername,
  loginAs,
} from "@/lib/auth/test-helpers";

function resetTestDb(): void {
  resetDbForTests();
  resetLuciaForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
}

describe("auth login", () => {
  beforeEach(() => {
    resetTestDb();
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

  it("invalidates sessions when user is disabled", async () => {
    const user = await createTestUser({ username: "disabled" });
    const sessionId = await loginAs(user.id);

    await getDb().update(users).set({ disabledAt: new Date() }).where(eq(users.id, user.id));
    await getLucia().invalidateUserSessions(user.id);

    const result = await getLucia().validateSession(sessionId);
    expect(result.user).toBeNull();
    expect(result.session).toBeNull();
  });
});

describe("admin guard", () => {
  beforeEach(() => {
    resetTestDb();
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
    const { user } = await createAdminSession();
    const guard = await canDisableUser(user, user.id);
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.error).toMatch(/last.*admin/i);
    }
  });

  it("allows disabling admin when another admin exists", async () => {
    await createAdminSession();
    const second = await createTestUser({ username: "admin2", role: "admin" });
    const guard = await canDisableUser(second, second.id);
    expect(guard.ok).toBe(true);
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
