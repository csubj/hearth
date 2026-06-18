import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getOpenModeUsername, isOpenMode } from "@/lib/auth/config";
import { getLucia, type AuthSession, type AuthUser } from "./lucia";

export type SessionResult =
  | { user: AuthUser; session: AuthSession }
  | { user: null; session: null };

const OPEN_MODE_SESSION_ID = "__hearth_open_mode__";

function createOpenModeSession(userId: string): AuthSession {
  return {
    id: OPEN_MODE_SESSION_ID,
    userId,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    fresh: false,
  } as AuthSession;
}

async function resolveOpenModeUser(): Promise<AuthUser | null> {
  const username = getOpenModeUsername();
  if (!username) {
    return null;
  }

  const [row] = await getDb().select().from(users).where(eq(users.username, username)).limit(1);

  if (!row || row.disabledAt) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    theme: row.theme,
    disabledAt: row.disabledAt,
  };
}

function isRealSession(session: AuthSession | null): session is AuthSession {
  return Boolean(session && session.id !== OPEN_MODE_SESSION_ID);
}

export const validateRequest = cache(async (): Promise<SessionResult> => {
  const lucia = getLucia();
  const sessionId = (await cookies()).get(lucia.sessionCookieName)?.value ?? null;
  if (!sessionId) {
    if (isOpenMode()) {
      const openUser = await resolveOpenModeUser();
      if (openUser) {
        return { user: openUser, session: createOpenModeSession(openUser.id) };
      }
    }
    return { user: null, session: null };
  }

  const result = await lucia.validateSession(sessionId);

  try {
    if (result.session?.fresh) {
      const sessionCookie = lucia.createSessionCookie(result.session.id);
      (await cookies()).set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
    }
    if (!result.session) {
      const sessionCookie = lucia.createBlankSessionCookie();
      (await cookies()).set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
    }
  } catch {
    // Next.js disallows setting cookies during static render
  }

  if (result.user?.disabledAt) {
    await lucia.invalidateSession(sessionId);
    try {
      const sessionCookie = lucia.createBlankSessionCookie();
      (await cookies()).set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
    } catch {
      // ignore
    }
    return { user: null, session: null };
  }

  if (result.user && result.session) {
    return result;
  }

  if (isOpenMode()) {
    const openUser = await resolveOpenModeUser();
    if (openUser) {
      return { user: openUser, session: createOpenModeSession(openUser.id) };
    }
  }

  return { user: null, session: null };
});

export async function requireUser(): Promise<{ user: AuthUser; session: AuthSession }> {
  const result = await validateRequest();
  if (result.user && result.session) {
    return result;
  }
  redirect("/login");
}

export async function requireAdmin(): Promise<{ user: AuthUser; session: AuthSession }> {
  const lucia = getLucia();
  const sessionId = (await cookies()).get(lucia.sessionCookieName)?.value ?? null;
  if (!sessionId) {
    redirect("/login?returnTo=/admin");
    return undefined as never;
  }

  const result = await lucia.validateSession(sessionId);
  if (!result.user || !result.session || result.user.disabledAt) {
    redirect("/login?returnTo=/admin");
    return undefined as never;
  }

  if (!isRealSession(result.session)) {
    redirect("/login?returnTo=/admin");
    return undefined as never;
  }

  if (result.user.role !== "admin") {
    redirect("/?error=Admin access required");
    return undefined as never;
  }

  return { user: result.user, session: result.session };
}

export function displayName(user: AuthUser): string {
  return user.displayName ?? user.username;
}

export async function touchLastSeen(userId: string): Promise<void> {
  const now = new Date();
  await getDb().update(users).set({ lastSeenAt: now, updatedAt: now }).where(eq(users.id, userId));
}
