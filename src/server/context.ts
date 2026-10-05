import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { User } from "better-auth";
import type { UserWithRole } from "better-auth/plugins/admin";

import { auth } from "./auth";
import { db } from "../db";
import { user as userTable, session as sessionTable } from "../db/schema";

/**
 * Per-request auth context (design D6 / task 3.2 groundwork).
 *
 * Resolves the caller from the session cookie or an `Authorization: Bearer`
 * API key, then returns the caller plus how they were authenticated. Kept
 * minimal for now; the full request context (property scope, bell count) is
 * loaded later and cached per request (D19).
 *
 * API keys act as their owner, but the caller is rejected with 401-equivalent
 * `null` when the key is revoked (disabled/expired) or the owner is banned.
 */
/**
 * Authenticated user with admin-plugin fields (role, banned, etc.) overlaid.
 * At runtime these come from the admin plugin's columns on the `user` table.
 */
export type AuthUser = User & UserWithRole;

export interface AuthContext {
  user: AuthUser | null;
  via: "web" | { apiKeyId: string; name: string | null };
  now: number;
  requestId: string;
}

/** Alias for AuthContext — the canonical oRPC context shape (design D3). */
export type AppContext = AuthContext;

interface ResolvedCaller {
  user: AuthUser | null;
  via: "web" | { apiKeyId: string; name: string | null };
}

const BEARER_RE = /^Bearer\s+(.+)$/i;

/** Better Auth session cookie names (HTTP dev vs HTTPS prod). */
const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

/** Extract the Better Auth session token from a Cookie header, or null. */
function getSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const name = part.slice(0, eqIdx).trim();
    if (SESSION_COOKIE_NAMES.includes(name)) {
      return part.slice(eqIdx + 1).trim() || null;
    }
  }
  return null;
}

/** Resolve the caller from a session cookie (direct DB lookup, cache off). */
async function resolveCookieCaller(request: Request): Promise<ResolvedCaller> {
  // The Better Auth session cookie value is `token.signature`. The session
  // credential (the high-entropy token) is the part before the first `.`.
  const signedValue = getSessionToken(request.headers.get("cookie"));
  if (!signedValue) return { user: null, via: "web" };

  const token = signedValue.split(".")[0];
  if (!token) return { user: null, via: "web" };

  const now = Date.now();
  const sess = db
    .select()
    .from(sessionTable)
    .where(eq(sessionTable.token, token))
    .get();

  if (!sess || sess.expiresAt.getTime() < now) {
    return { user: null, via: "web" };
  }

  const u = db
    .select()
    .from(userTable)
    .where(eq(userTable.id, sess.userId))
    .get();

  if (!u || u.banned === true) return { user: null, via: "web" };

  return { user: u as unknown as AuthUser, via: "web" };
}

async function resolveCaller(request: Request): Promise<ResolvedCaller> {
  const authorization = request.headers.get("authorization");
  const bearer = authorization ? BEARER_RE.exec(authorization) : null;

  if (!bearer) {
    return resolveCookieCaller(request);
  }

  const key = bearer[1];
  const result = await auth.api.verifyApiKey({ body: { key } });
  if (!result.valid || !result.key) return { user: null, via: "web" };

  const apiKey = result.key;
  const now = Date.now();
  if (apiKey.enabled === false) return { user: null, via: "web" };
  if (apiKey.expiresAt !== null && apiKey.expiresAt.getTime() < now) {
    return { user: null, via: "web" };
  }

  // `references` defaults to "user", so `referenceId` is the owning user's id.
  const owner = db
    .select()
    .from(userTable)
    .where(eq(userTable.id, apiKey.referenceId))
    .get();

  if (!owner || owner.banned === true) return { user: null, via: "web" };

  return {
    user: owner as unknown as AuthUser,
    via: { apiKeyId: apiKey.id, name: apiKey.name ?? null },
  };
}

/** Resolve the authenticated user (cookie or bearer key), or `null`. */
export async function fromSession(request: Request): Promise<AuthUser | null> {
  return (await resolveCaller(request)).user;
}

/** Build the per-request context (`{ user, via, now, requestId }`). */
export async function getContext(request: Request): Promise<AuthContext> {
  const { user, via } = await resolveCaller(request);
  return { user, via, now: Date.now(), requestId: randomUUID() };
}
