"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { auth } from "@/server/auth";

/**
 * Parse a single `Set-Cookie` header string into its name, value, and
 * cookie options for `cookies().set()`.
 */
function parseSetCookieStr(raw: string): {
  name: string;
  value: string;
  options: Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2];
} | null {
  const parts = raw.split(";").map((p) => p.trim());
  const nameValuePart = parts[0] ?? "";
  const eqIdx = nameValuePart.indexOf("=");
  if (eqIdx === -1) return null;
  const name = nameValuePart.slice(0, eqIdx).trim();
  const value = nameValuePart.slice(eqIdx + 1).trim();
  if (!name) return null;

  const options: Record<string, unknown> = {};
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i] ?? "";
    const lc = part.toLowerCase();
    if (lc === "httponly") {
      options.httpOnly = true;
    } else if (lc === "secure") {
      options.secure = true;
    } else if (lc.startsWith("max-age=")) {
      const n = parseInt(part.slice(8), 10);
      if (!isNaN(n)) options.maxAge = n;
    } else if (lc.startsWith("path=")) {
      options.path = part.slice(5);
    } else if (lc.startsWith("samesite=")) {
      options.sameSite = part.slice(9).toLowerCase() as
        | "lax"
        | "strict"
        | "none";
    } else if (lc.startsWith("expires=")) {
      const d = new Date(part.slice(8));
      if (!isNaN(d.getTime())) options.expires = d;
    }
  }

  return {
    name,
    value,
    options: options as Parameters<
      Awaited<ReturnType<typeof cookies>>["set"]
    >[2],
  };
}

/**
 * Forward every `Set-Cookie` header from a Better Auth response to the
 * Next.js response so session cookies reach the browser from a server action.
 */
async function forwardSetCookies(responseHeaders: Headers): Promise<void> {
  const cookieStore = await cookies();
  // `getSetCookie()` returns each Set-Cookie value as a separate string
  // (available in Node 18+ via the WHATWG Fetch API Headers class).
  const setCookies: string[] =
    typeof responseHeaders.getSetCookie === "function"
      ? responseHeaders.getSetCookie()
      : (responseHeaders.get("set-cookie") ?? "").split(",").filter(Boolean);

  for (const raw of setCookies) {
    const parsed = parseSetCookieStr(raw);
    if (parsed) {
      cookieStore.set(parsed.name, parsed.value, parsed.options);
    }
  }
}

/**
 * Server action: sign in with username and password.
 *
 * Validates via Better Auth's `signInUsername` endpoint, forwards the session
 * cookie to the client, then redirects to the sanitized `returnTo` path.
 * Returns a generic error on failure — the message does NOT reveal whether the
 * username or password was wrong (spec: "Wrong credentials" scenario).
 */
export async function signInAction(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string }> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // returnTo is sanitized in the page before it reaches the form; sanitize
  // here again as a defence-in-depth measure.
  const rawReturnTo = String(formData.get("returnTo") ?? "").trim();
  const returnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : "/";

  let responseHeaders: Headers | null = null;

  try {
    const h = await headers();
    const result = await auth.api.signInUsername({
      body: { username, password },
      headers: h,
      returnHeaders: true,
    });
    responseHeaders = result.headers;
  } catch {
    return { error: "Invalid username or password" };
  }

  // Forward the session cookie — must happen outside the try/catch so that
  // any errors from `cookies()` propagate normally; redirect() does too.
  if (responseHeaders) {
    await forwardSetCookies(responseHeaders);
  }

  redirect(returnTo);
}

/**
 * Server action: sign out the current user.
 *
 * Calls Better Auth's sign-out endpoint, forwards the cookie-clearing
 * Set-Cookie headers, and redirects to `/login`.
 */
export async function signOutAction(): Promise<never> {
  const h = await headers();

  try {
    const result = await auth.api.signOut({
      headers: h,
      returnHeaders: true,
    });
    await forwardSetCookies(result.headers);
  } catch {
    // Ignore sign-out errors — redirect to login regardless.
  }

  redirect("/login");
}
