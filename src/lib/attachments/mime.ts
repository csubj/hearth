import type { AllowedMimeType } from "./config";
import { ALLOWED_MIME_TYPES } from "./config";

const JPEG = [0xff, 0xd8, 0xff] as const;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const GIF87 = "GIF87a";
const GIF89 = "GIF89a";
const WEBP_RIFF = "RIFF";
const WEBP_MARKER = "WEBP";

export type MimeValidationResult =
  | { ok: true; mimeType: AllowedMimeType; extension: string }
  | { ok: false; error: string };

function startsWithBytes(buffer: Buffer, prefix: readonly number[]): boolean {
  if (buffer.length < prefix.length) {
    return false;
  }
  return prefix.every((byte, index) => buffer[index] === byte);
}

function startsWithAscii(buffer: Buffer, value: string, offset = 0): boolean {
  if (buffer.length < offset + value.length) {
    return false;
  }
  return buffer.toString("ascii", offset, offset + value.length) === value;
}

export function detectImageMime(buffer: Buffer): MimeValidationResult {
  if (startsWithBytes(buffer, JPEG)) {
    return { ok: true, mimeType: "image/jpeg", extension: "jpg" };
  }

  if (startsWithBytes(buffer, PNG)) {
    return { ok: true, mimeType: "image/png", extension: "png" };
  }

  if (buffer.length >= 6 && (startsWithAscii(buffer, GIF87) || startsWithAscii(buffer, GIF89))) {
    return { ok: true, mimeType: "image/gif", extension: "gif" };
  }

  if (
    buffer.length >= 12 &&
    startsWithAscii(buffer, WEBP_RIFF) &&
    startsWithAscii(buffer, WEBP_MARKER, 8)
  ) {
    return { ok: true, mimeType: "image/webp", extension: "webp" };
  }

  return { ok: false, error: "Unsupported or unrecognized image format." };
}

export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}
