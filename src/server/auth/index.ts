import { betterAuth, APIError } from "better-auth";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { username, admin } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../db";
import * as schema from "../../db/schema";
import {
  getClientIp,
  isRateLimited,
  recordFailure,
  recordSuccess,
} from "./rate-limit";

/**
 * Sign-in rate-limit hook (D6): before/after on `/sign-in/username`.
 *
 * before — reject if the username|ip pair has ≥ 5 failures in 15 min.
 * after  — on failure record the attempt; on success reset the counter.
 */
const _rateLimitBefore = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/username") return;
  const body = ctx.body as { username?: string } | null | undefined;
  const usernameVal = body?.username;
  if (!usernameVal) return;
  // `ctx.request` is populated on HTTP calls; `ctx.headers` on auth.api.* calls.
  const ip = getClientIp(ctx.request ?? ctx.headers);
  if (isRateLimited(usernameVal, ip)) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "Too many failed sign-in attempts. Please try again later.",
    });
  }
});

const _rateLimitAfter = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/username") return;
  const body = ctx.body as { username?: string } | null | undefined;
  const usernameVal = body?.username;
  if (!usernameVal) return;
  const ip = getClientIp(ctx.request ?? ctx.headers);
  const returned = ctx.context.returned;
  if (isAPIError(returned)) {
    recordFailure(usernameVal, ip);
  } else if (returned !== undefined) {
    recordSuccess(usernameVal, ip);
  }
});

/**
 * Better Auth options for hearth (design D6).
 *
 * - Plugins: `username` (immutable), `admin` (ban = disable), `apiKey`
 *   (per-key rate limit off).
 * - Sign-up is disabled — accounts are created by an admin or bootstrap.
 * - Sessions last 30 days; cookie cache off so bans take effect immediately.
 * - Synthetic `<username>@users.hearth.invalid` email (Better Auth requires
 *   a unique email; it is never shown to users).
 * - `basePath` defaults to `/api/auth`, matching the mount in
 *   `app/api/auth/[...all]/route.ts`.
 */
const authOptions = {
  appName: "hearth",
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh at most once a day
    cookieCache: { enabled: false },
  },
  plugins: [
    username({ immutableUsername: true, displayUsername: false }),
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    apiKey({ rateLimit: { enabled: false } }),
  ],
  hooks: {
    before: _rateLimitBefore,
    after: _rateLimitAfter,
  },
};

/**
 * The plain Better Auth options object. Exported so tests can build a parallel
 * in-memory auth instance via `getTestInstance(authOptions)` and exercise the
 * exact plugin/option configuration (D6) without duplicating it.
 */
export { authOptions };

export const auth = betterAuth(authOptions);
