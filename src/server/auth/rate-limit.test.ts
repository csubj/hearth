/**
 * Tests for the sign-in failed-attempt rate limiter (task 2.4, design D6).
 *
 * Covers three spec scenarios:
 *  1. The 6th attempt after 5 failures for the same username|ip is
 *     rate_limited — even with the correct password.
 *  2. The same username from a different IP is NOT blocked.
 *  3. A successful sign-in resets the counter (4 failures → success → 5 more
 *     failures needed before rate_limited).
 *
 * Unit tests exercise the limiter functions directly for precision.
 * One integration test exercises the Better Auth hook path via
 * `getTestInstance` + `auth.api.signInUsername` to prove wiring.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getTestInstance } from "better-auth/test";
import { isAPIError } from "better-auth/api";
import type { User } from "better-auth";
import {
  isRateLimited,
  recordFailure,
  recordSuccess,
  prune,
  getClientIp,
  WINDOW_MS,
  MAX_FAILURES,
  _resetStore,
} from "./rate-limit";

// ---------------------------------------------------------------------------
// Point the shared src/db singleton at an in-memory DB so tests never touch
// the on-disk data/hearth.db (same pattern as auth.test.ts).
// ---------------------------------------------------------------------------
vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { authOptions } from "./index";

// Strip the drizzle adapter (database) so getTestInstance uses its own
// in-memory SQLite adapter, and re-enable sign-up so the test user can be
// bootstrapped.
const { database, ...authOptionsWithoutDb } = authOptions;
void database;
const TEST_AUTH_OPTIONS = {
  ...authOptionsWithoutDb,
  emailAndPassword: {
    ...authOptionsWithoutDb.emailAndPassword,
    disableSignUp: false,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const USER = "alice";
const IP_A = "1.2.3.4";
const IP_B = "5.6.7.8";
const NOW = Date.now();

/** Simulate MAX_FAILURES failures for a username+ip pair. */
function exhaustFailures(
  username: string,
  ip: string,
  count = MAX_FAILURES,
  baseNow = NOW,
): void {
  for (let i = 0; i < count; i++) {
    recordFailure(username, ip, baseNow + i);
  }
}

// ---------------------------------------------------------------------------
// Unit tests — limiter API
// ---------------------------------------------------------------------------
describe("rate-limit unit tests", () => {
  beforeEach(() => {
    _resetStore();
  });

  // Scenario 1: 6th attempt after 5 failures is rate_limited ----------------
  describe("Scenario 1 – 6th attempt is rate_limited", () => {
    it("allows the 5th attempt (not yet at threshold)", () => {
      exhaustFailures(USER, IP_A, MAX_FAILURES - 1, NOW);
      expect(isRateLimited(USER, IP_A, NOW + MAX_FAILURES)).toBe(false);
    });

    it("blocks the 6th attempt after 5 failures within the window", () => {
      exhaustFailures(USER, IP_A, MAX_FAILURES, NOW);
      expect(isRateLimited(USER, IP_A, NOW + MAX_FAILURES)).toBe(true);
    });

    it("still blocks even after further failures accumulate", () => {
      exhaustFailures(USER, IP_A, MAX_FAILURES + 2, NOW);
      expect(isRateLimited(USER, IP_A, NOW + MAX_FAILURES + 2)).toBe(true);
    });
  });

  // Scenario 2: different IP is not blocked ----------------------------------
  describe("Scenario 2 – different IP is not blocked", () => {
    it("blocks IP_A after 5 failures but IP_B is free", () => {
      exhaustFailures(USER, IP_A, MAX_FAILURES, NOW);
      expect(isRateLimited(USER, IP_A, NOW + MAX_FAILURES)).toBe(true);
      expect(isRateLimited(USER, IP_B, NOW + MAX_FAILURES)).toBe(false);
    });

    it("independently tracks failures per IP", () => {
      exhaustFailures(USER, IP_A, MAX_FAILURES, NOW);
      exhaustFailures(USER, IP_B, MAX_FAILURES - 1, NOW);
      expect(isRateLimited(USER, IP_A, NOW + MAX_FAILURES)).toBe(true);
      expect(isRateLimited(USER, IP_B, NOW + MAX_FAILURES)).toBe(false);
    });
  });

  // Scenario 3: success resets the count ------------------------------------
  describe("Scenario 3 – success resets the count", () => {
    it("after 4 failures and a success the counter is zero (not rate_limited)", () => {
      exhaustFailures(USER, IP_A, MAX_FAILURES - 1, NOW);
      recordSuccess(USER, IP_A);
      expect(isRateLimited(USER, IP_A, NOW + MAX_FAILURES)).toBe(false);
    });

    it("needs MAX_FAILURES more failures to be rate_limited again after reset", () => {
      exhaustFailures(USER, IP_A, MAX_FAILURES - 1, NOW);
      recordSuccess(USER, IP_A);
      // 4 more failures — still under threshold
      exhaustFailures(USER, IP_A, MAX_FAILURES - 1, NOW + 100);
      expect(isRateLimited(USER, IP_A, NOW + 200)).toBe(false);
      // 1 more → now at threshold
      recordFailure(USER, IP_A, NOW + 200);
      expect(isRateLimited(USER, IP_A, NOW + 201)).toBe(true);
    });
  });

  // Window expiry -----------------------------------------------------------
  describe("window expiry", () => {
    it("failures older than the window do not count", () => {
      // Record MAX_FAILURES failures right at the edge of the window
      const old = NOW - WINDOW_MS - 1;
      exhaustFailures(USER, IP_A, MAX_FAILURES, old);
      // Check at NOW — all failures are outside the window
      expect(isRateLimited(USER, IP_A, NOW)).toBe(false);
    });

    it("a mix of old and fresh failures only counts fresh ones", () => {
      // 3 old failures (outside window)
      exhaustFailures(USER, IP_A, 3, NOW - WINDOW_MS - 100);
      // 2 fresh failures (inside window)
      exhaustFailures(USER, IP_A, 2, NOW - 1000);
      expect(isRateLimited(USER, IP_A, NOW)).toBe(false); // only 2 in-window
      recordFailure(USER, IP_A, NOW); // brings in-window count to 3
      recordFailure(USER, IP_A, NOW + 1);
      recordFailure(USER, IP_A, NOW + 2); // 5 total in window
      expect(isRateLimited(USER, IP_A, NOW + 3)).toBe(true);
    });
  });

  // prune() -----------------------------------------------------------------
  describe("prune()", () => {
    it("removes entries with no in-window timestamps", () => {
      const old = NOW - WINDOW_MS - 1;
      exhaustFailures(USER, IP_A, MAX_FAILURES, old);
      exhaustFailures("bob", IP_B, 2, NOW); // should survive
      prune(NOW);
      expect(isRateLimited(USER, IP_A, NOW)).toBe(false);
      expect(isRateLimited("bob", IP_B, NOW)).toBe(false); // 2 < threshold
    });

    it("keeps entries that still have in-window timestamps", () => {
      exhaustFailures(USER, IP_A, MAX_FAILURES, NOW - 1000);
      prune(NOW);
      expect(isRateLimited(USER, IP_A, NOW)).toBe(true);
    });
  });

  // getClientIp() -----------------------------------------------------------
  describe("getClientIp()", () => {
    it("returns 'unknown' when TRUST_PROXY is not set", () => {
      const original = process.env["TRUST_PROXY"];
      delete process.env["TRUST_PROXY"];
      const req = new Request("http://localhost/", {
        headers: { "x-forwarded-for": "9.9.9.9" },
      });
      expect(getClientIp(req)).toBe("unknown");
      if (original !== undefined) process.env["TRUST_PROXY"] = original;
    });

    it("returns the first x-forwarded-for value when TRUST_PROXY=1", () => {
      process.env["TRUST_PROXY"] = "1";
      const req = new Request("http://localhost/", {
        headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" },
      });
      expect(getClientIp(req)).toBe("10.0.0.1");
      delete process.env["TRUST_PROXY"];
    });

    it("returns 'unknown' when request is null", () => {
      expect(getClientIp(null)).toBe("unknown");
    });
  });
});

// ---------------------------------------------------------------------------
// Integration test — exercises the Better Auth hook wiring
// ---------------------------------------------------------------------------
describe("rate-limit integration (hook wiring)", () => {
  beforeEach(() => {
    _resetStore();
    process.env["TRUST_PROXY"] = "1";
  });

  afterEach(() => {
    delete process.env["TRUST_PROXY"];
  });

  it(
    "Scenario 1 hook – 6th attempt is rate_limited even with correct password",
    async () => {
      const { auth: testAuth } = await getTestInstance(TEST_AUTH_OPTIONS, {
        testUser: {
          email: "alice@users.hearth.invalid",
          password: "correctpass1",
          name: "Alice",
          username: "alice",
        } as Partial<User> & { password: string },
      });

      const hdrs = new Headers({ "x-forwarded-for": IP_A });

      // Fail 5 times with wrong password
      for (let i = 0; i < MAX_FAILURES; i++) {
        await expect(
          testAuth.api.signInUsername({
            body: { username: "alice", password: "wrongpass" },
            headers: hdrs,
          }),
        ).rejects.toSatisfy(isAPIError);
      }

      // 6th attempt with CORRECT password must still be rejected (rate_limited)
      const err = await testAuth.api
        .signInUsername({
          body: { username: "alice", password: "correctpass1" },
          headers: hdrs,
        })
        .catch((e: unknown) => e);

      expect(isAPIError(err)).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((err as any).statusCode).toBe(429);
    },
  );

  it(
    "Scenario 2 hook – different IP is evaluated normally (not blocked)",
    async () => {
      const { auth: testAuth } = await getTestInstance(TEST_AUTH_OPTIONS, {
        testUser: {
          email: "bob@users.hearth.invalid",
          password: "correctpass2",
          name: "Bob",
          username: "bob",
        } as Partial<User> & { password: string },
      });

      const hdrsA = new Headers({ "x-forwarded-for": IP_A });
      const hdrsB = new Headers({ "x-forwarded-for": IP_B });

      // Exhaust failures from IP_A
      for (let i = 0; i < MAX_FAILURES; i++) {
        await expect(
          testAuth.api.signInUsername({
            body: { username: "bob", password: "wrongpass" },
            headers: hdrsA,
          }),
        ).rejects.toSatisfy(isAPIError);
      }

      // Sign-in from IP_B should succeed (different key, not blocked)
      const result = await testAuth.api.signInUsername({
        body: { username: "bob", password: "correctpass2" },
        headers: hdrsB,
      });
      expect(result.user.username).toBe("bob");
    },
  );

  it(
    "Scenario 3 hook – success resets the count",
    async () => {
      const { auth: testAuth } = await getTestInstance(TEST_AUTH_OPTIONS, {
        testUser: {
          email: "carol@users.hearth.invalid",
          password: "correctpass3",
          name: "Carol",
          username: "carol",
        } as Partial<User> & { password: string },
      });

      const hdrs = new Headers({ "x-forwarded-for": IP_A });

      // 4 failures
      for (let i = 0; i < MAX_FAILURES - 1; i++) {
        await expect(
          testAuth.api.signInUsername({
            body: { username: "carol", password: "wrongpass" },
            headers: hdrs,
          }),
        ).rejects.toSatisfy(isAPIError);
      }

      // Successful sign-in — resets the counter
      const ok = await testAuth.api.signInUsername({
        body: { username: "carol", password: "correctpass3" },
        headers: hdrs,
      });
      expect(ok.user.username).toBe("carol");

      // Fail 4 more times — should still be under the threshold
      for (let i = 0; i < MAX_FAILURES - 1; i++) {
        await expect(
          testAuth.api.signInUsername({
            body: { username: "carol", password: "wrongpass" },
            headers: hdrs,
          }),
        ).rejects.toSatisfy(isAPIError);
      }

      // 5th failure since last reset → not yet rate_limited
      await expect(
        testAuth.api.signInUsername({
          body: { username: "carol", password: "wrongpass" },
          headers: hdrs,
        }),
      ).rejects.toSatisfy(isAPIError);

      // 6th failure → now rate_limited
      const err = await testAuth.api
        .signInUsername({
          body: { username: "carol", password: "wrongpass" },
          headers: hdrs,
        })
        .catch((e: unknown) => e);

      expect(isAPIError(err)).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((err as any).statusCode).toBe(429);
    },
  );
});
