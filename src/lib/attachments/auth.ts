import { cookies } from "next/headers";
import { getLucia, type AuthSession, type AuthUser } from "@/lib/auth/lucia";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

export type ApiSessionResult =
  | { user: AuthUser; session: AuthSession }
  | { user: null; session: null };

export async function validateApiSession(): Promise<ApiSessionResult> {
  const lucia = getLucia();
  const sessionId = (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;

  if (!sessionId) {
    return { user: null, session: null };
  }

  const result = await lucia.validateSession(sessionId);

  if (!result.user || !result.session) {
    return { user: null, session: null };
  }

  if (result.user.disabledAt) {
    await lucia.invalidateSession(sessionId);
    return { user: null, session: null };
  }

  return { user: result.user, session: result.session };
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
