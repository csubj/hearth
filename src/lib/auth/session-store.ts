import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

// Stored in seconds to match sessions written by the previous auth library.
const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

export type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
  role: "member" | "admin";
  theme: "default" | "warm" | "dark" | "gamer";
  disabledAt: Date | null;
};

export type AuthSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  fresh: boolean;
};

type SessionCookie = {
  name: string;
  value: string;
  attributes: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
  };
};

function sessionExpirySeconds(): number {
  return Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS;
}

function createSessionCookie(name: string, value: string): SessionCookie {
  return {
    name,
    value,
    attributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

function sessionCookieFactories() {
  return {
    createSessionCookie: (sessionId: string) => createSessionCookie(SESSION_COOKIE_NAME, sessionId),
    createBlankSessionCookie: () => createSessionCookie(SESSION_COOKIE_NAME, ""),
  };
}

export async function createSession(userId: string): Promise<AuthSession> {
  const id = randomUUID();
  const expiresAtSeconds = sessionExpirySeconds();
  await getDb().insert(sessions).values({ id, userId, expiresAt: expiresAtSeconds });
  return { id, userId, expiresAt: new Date(expiresAtSeconds * 1000), fresh: true };
}

type SessionValidation = { session: AuthSession; user: AuthUser } | { session: null; user: null };

export async function validateSession(sessionId: string): Promise<SessionValidation> {
  const db = getDb();
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) {
    return { session: null, user: null };
  }

  const { session, user } = row;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (session.expiresAt <= nowSeconds) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return { session: null, user: null };
  }

  return {
    session: {
      id: session.id,
      userId: session.userId,
      expiresAt: new Date(session.expiresAt * 1000),
      fresh: false,
    },
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      theme: user.theme,
      disabledAt: user.disabledAt,
    },
  };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.id, sessionId));
}

export async function invalidateUserSessions(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

/** Facade kept for callers that used the old Lucia instance API. */
const sessionStore = {
  sessionCookieName: SESSION_COOKIE_NAME,
  createSessionCookie: sessionCookieFactories().createSessionCookie,
  createBlankSessionCookie: sessionCookieFactories().createBlankSessionCookie,
  createSession,
  validateSession,
  invalidateSession,
  invalidateUserSessions,
};

export function getSessionStore() {
  return sessionStore;
}

/** Test-only: no cached state, kept for API compatibility. */
export function resetSessionStoreForTests(): void {
  // no-op
}
