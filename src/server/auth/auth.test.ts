import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "better-auth/test";
import type { User } from "better-auth";

// Point the shared `src/db` singleton at an in-memory database *before* the
// modules below are imported, so tests never touch the on-disk data/hearth.db.
vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { createTestDatabase } from "../../db/testing";
import { POST, isAllowedAuthPath } from "@/app/api/auth/[...all]/route";
import { authOptions } from "./index";

// Sign-up is disabled in production (`disableSignUp: true`). The test instance
// toggles it off only so `getTestInstance` can bootstrap its in-memory test
// user; the username sign-in path under test is unaffected by that flag.
//
// `database` is dropped so `getTestInstance` backs the instance with its own
// in-memory sqlite adapter instead of the shared (unmigrated) `src/db` client.
const { database, ...authOptionsWithoutDb } = authOptions;
void database;
const TEST_AUTH_OPTIONS = {
  ...authOptionsWithoutDb,
  emailAndPassword: { ...authOptionsWithoutDb.emailAndPassword, disableSignUp: false },
};

describe("Better Auth integration (task 2.1)", () => {
  it("creates the auth tables through migrations", () => {
    const { connection } = createTestDatabase();

    const rows = connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];

    const names = rows.map((row) => row.name);
    expect(names).toContain("user");
    expect(names).toContain("session");
    expect(names).toContain("account");
    expect(names).toContain("apikey");

    connection.close();
  });

  describe("HTTP allowlist", () => {
    it("only allows sign-in/username, sign-out and get-session", () => {
      expect(isAllowedAuthPath("sign-in/username")).toBe(true);
      expect(isAllowedAuthPath("sign-out")).toBe(true);
      expect(isAllowedAuthPath("get-session")).toBe(true);

      expect(isAllowedAuthPath("sign-up/email")).toBe(false);
      expect(isAllowedAuthPath("admin/set-role")).toBe(false);
      expect(isAllowedAuthPath("admin/ban")).toBe(false);
      expect(isAllowedAuthPath("admin/remove-user")).toBe(false);
      expect(isAllowedAuthPath("admin/impersonate")).toBe(false);
      expect(isAllowedAuthPath("admin/set-password")).toBe(false);
      expect(isAllowedAuthPath("api-key/create")).toBe(false);
      expect(isAllowedAuthPath("update-user")).toBe(false);
    });

    it("returns 404 for /api/auth/sign-up/email", async () => {
      const request = new Request("http://localhost/api/auth/sign-up/email", {
        method: "POST",
      });
      const response = await POST(request, {
        params: Promise.resolve({ all: ["sign-up", "email"] }),
      });
      expect(response.status).toBe(404);
    });

    it("returns 404 for /api/auth/admin/set-role", async () => {
      const request = new Request("http://localhost/api/auth/admin/set-role", {
        method: "POST",
      });
      const response = await POST(request, {
        params: Promise.resolve({ all: ["admin", "set-role"] }),
      });
      expect(response.status).toBe(404);
    });
  });

  describe("username sign-in", () => {
    it("rejects an unauthenticated request and creates a session for a valid sign-in", async () => {
      const { auth: testAuth } = await getTestInstance(TEST_AUTH_OPTIONS, {
        testUser: {
          email: "test@users.hearth.invalid",
          password: "password123",
          name: "Test",
          username: "testuser",
        } as Partial<User> & { password: string },
      });

      const unauthenticated = await testAuth.api.getSession({
        headers: new Headers(),
      });
      expect(unauthenticated).toBeNull();

      const signIn = await testAuth.api.signInUsername({
        body: { username: "testuser", password: "password123" },
      });
      expect(signIn.user.username).toBe("testuser");
      expect(signIn.token).toBeTruthy();
    });
  });
});
