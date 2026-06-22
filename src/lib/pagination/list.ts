export const DEFAULT_LIST_PAGE_SIZE = 25;

export type ListPage<T> = {
  items: T[];
  nextOffset: number | null;
};

export function parseOffset(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

export function parseLimit(value: unknown, fallback = DEFAULT_LIST_PAGE_SIZE): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), 100);
}

/**
 * Builds a ListPage from rows fetched with `limit + 1` so we can detect whether
 * another page exists without a separate count query.
 */
export function toListPage<T>(rows: T[], offset: number, limit: number): ListPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextOffset: hasMore ? offset + limit : null,
  };
}
