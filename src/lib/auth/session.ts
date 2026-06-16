import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getLucia, type AuthSession, type AuthUser } from "./lucia";

export type SessionResult =
  | { user: AuthUser; session: AuthSession }
  | { user: null; session: null };

export const validateRequest = cache(async (): Promise<SessionResult> => {
  const lucia = getLucia();
  const sessionId = (await cookies()).get(lucia.sessionCookieName)?.value ?? null;
  if (!sessionId) {
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

  return result;
});

export async function requireUser(): Promise<{ user: AuthUser; session: AuthSession }> {
  const result = await validateRequest();
  if (!result.user || !result.session) {
    redirect("/login");
  }
  return result;
}

export async function requireAdmin(): Promise<{ user: AuthUser; session: AuthSession }> {
  const result = await requireUser();
  if (result.user.role !== "admin") {
    redirect("/?error=Admin access required");
  }
  return result;
}

export function displayName(user: AuthUser): string {
  return user.displayName ?? user.username;
}

export async function touchLastSeen(userId: string): Promise<void> {
  const now = new Date();
  await getDb().update(users).set({ lastSeenAt: now, updatedAt: now }).where(eq(users.id, userId));
}
