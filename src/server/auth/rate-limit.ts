/**
 * In-memory failed-attempt sign-in rate limiter (design D6).
 *
 * Key  : `lower(username)|ip`
 * Rule : 5 failures within any 15-minute window block further attempts with
 *        a `rate_limited` error.  A successful sign-in resets the counter.
 *
 * `prune(now)` drops entries whose most-recent failure is outside the window.
 * It is called on every scheduler tick (task 3.5 wires it).
 *
 * IP extraction:
 *   - `TRUST_PROXY=1`  → first value of the `x-forwarded-for` header
 *   - otherwise        → `"unknown"` (socket info is unavailable in Web Request)
 */

export const WINDOW_MS = 15 * 60 * 1_000; // 15 minutes
export const MAX_FAILURES = 5;

/** Map of key → array of failure timestamps (epoch ms). */
const _store = new Map<string, number[]>();

/** Build the composite key. */
function makeKey(username: string, ip: string): string {
  return `${username.toLowerCase()}|${ip}`;
}

/**
 * Derive the client IP from a Request or Headers object.
 *
 * - If `TRUST_PROXY=1`: first entry of the `x-forwarded-for` header
 * - Otherwise: `"unknown"` — the Web Request API does not expose the socket
 *
 * Accepts `Request | Headers | null | undefined` because Better Auth
 * populates `ctx.request` for HTTP calls and `ctx.headers` for direct
 * `auth.api.*` calls; callers should pass whichever is available.
 */
export function getClientIp(
  source: Request | Headers | null | undefined,
): string {
  if (process.env["TRUST_PROXY"] !== "1" || !source) return "unknown";
  const headers =
    source instanceof Headers ? source : (source as Request).headers;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/**
 * Returns `true` when the username+ip pair has reached `MAX_FAILURES` within
 * the current 15-minute window.
 */
export function isRateLimited(
  username: string,
  ip: string,
  now = Date.now(),
): boolean {
  const key = makeKey(username, ip);
  const timestamps = _store.get(key);
  if (!timestamps) return false;
  const windowStart = now - WINDOW_MS;
  return timestamps.filter((t) => t > windowStart).length >= MAX_FAILURES;
}

/**
 * Record one failed sign-in attempt.  Timestamps outside the window are
 * dropped so the array stays small.
 */
export function recordFailure(
  username: string,
  ip: string,
  now = Date.now(),
): void {
  const key = makeKey(username, ip);
  const existing = _store.get(key) ?? [];
  const windowStart = now - WINDOW_MS;
  const recent = existing.filter((t) => t > windowStart);
  recent.push(now);
  _store.set(key, recent);
}

/**
 * Reset the failure counter for a username+ip pair after a successful
 * sign-in.
 */
export function recordSuccess(username: string, ip: string): void {
  _store.delete(makeKey(username, ip));
}

/**
 * Remove entries whose failure timestamps all fall outside the current window.
 * Called on every scheduler tick so the map does not grow unboundedly.
 */
export function prune(now = Date.now()): void {
  const windowStart = now - WINDOW_MS;
  for (const [key, timestamps] of _store) {
    const recent = timestamps.filter((t) => t > windowStart);
    if (recent.length === 0) {
      _store.delete(key);
    } else {
      _store.set(key, recent);
    }
  }
}

/** Reset the store.  Test-only. */
export function _resetStore(): void {
  _store.clear();
}
