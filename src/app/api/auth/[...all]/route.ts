import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

/**
 * Better Auth HTTP mount point (design D6).
 *
 * We forward only the endpoints we actually expose to the outside world:
 *   - `POST /api/auth/sign-in/username`  (sign in by username)
 *   - `POST /api/auth/sign-out`
 *   - `GET  /api/auth/get-session`
 *
 * Every other Better Auth path returns 404 — sign-up, the admin endpoints
 * (set-role, ban, remove-user, impersonate, set-password), API-key CRUD and
 * update-user. Our procedures call `auth.api.*` server-side, so last-admin
 * guards and session-only rules cannot be bypassed over HTTP. The allowlist
 * also keeps endpoints introduced by future plugin versions closed by default.
 */

const { GET: authGET, POST: authPOST } = toNextJsHandler(auth);

const ALLOWED_PATHS = new Set(["sign-in/username", "sign-out", "get-session"]);

/** Whether a catch-all path (`[...all]` joined by `/`) is on the allowlist. */
export function isAllowedAuthPath(path: string): boolean {
  return ALLOWED_PATHS.has(path);
}

type Params = { params: Promise<{ all: string[] }> };

async function resolvePath({ params }: Params): Promise<string> {
  const { all } = await params;
  return (all ?? []).join("/");
}

export async function GET(request: Request, context: Params): Promise<Response> {
  const path = await resolvePath(context);
  if (!isAllowedAuthPath(path)) return new Response("Not Found", { status: 404 });
  return authGET(request);
}

export async function POST(request: Request, context: Params): Promise<Response> {
  const path = await resolvePath(context);
  if (!isAllowedAuthPath(path)) return new Response("Not Found", { status: 404 });
  return authPOST(request);
}
