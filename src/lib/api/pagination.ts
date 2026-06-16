import { z } from "zod";

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
  cursor: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type PaginatedResult<T> = {
  data: T[];
  nextCursor: string | null;
};

type CursorPayload = {
  t: number;
  id: string;
};

export function encodeCursor(createdAt: Date, id: string): string {
  const payload: CursorPayload = { t: createdAt.getTime(), id };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as CursorPayload;
    if (typeof parsed.t !== "number" || typeof parsed.id !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function paginateRows<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
): PaginatedResult<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
  return { data, nextCursor };
}
