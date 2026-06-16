import { createHash, randomBytes } from "node:crypto";

export const API_TOKEN_PREFIX = "hearth_pat_";
export const API_TOKEN_PREFIX_DISPLAY_LENGTH = 16;

export function generateApiTokenSecret(): {
  token: string;
  prefix: string;
  tokenHash: string;
} {
  const random = randomBytes(32).toString("base64url");
  const token = `${API_TOKEN_PREFIX}${random}`;
  const prefix = token.slice(0, API_TOKEN_PREFIX_DISPLAY_LENGTH);
  return { token, prefix, tokenHash: hashApiToken(token) };
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
