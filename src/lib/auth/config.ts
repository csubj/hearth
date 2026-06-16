/** Auth mode configuration (read once per process). */

export type AuthMode = "required" | "open";

const VALID_MODES: AuthMode[] = ["required", "open"];

export function getAuthMode(): AuthMode {
  const raw = process.env.AUTH_MODE ?? "required";
  if (VALID_MODES.includes(raw as AuthMode)) {
    return raw as AuthMode;
  }
  return "required";
}

export function isOpenMode(): boolean {
  return getAuthMode() === "open";
}

export function getOpenModeUsername(): string | undefined {
  const username = process.env.OPEN_MODE_USERNAME?.trim();
  return username || undefined;
}
