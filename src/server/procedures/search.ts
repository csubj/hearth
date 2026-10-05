/**
 * Search procedure (design D10, task 12.2).
 *
 * Global full-text search across every module, place, tag, assignee and
 * text content. Uses SQLite FTS5:
 *   - `bm25(search_index, 0, 0, 10, 1)` ranks title matches 10× higher;
 *   - `snippet()` produces a highlighted body snippet;
 *   - archived and trashed entities are excluded;
 *   - the user's property scope is applied (D7);
 *   - `type:`, `place:`, `tag:` and `@member` filters from the query parser.
 *
 * Route: GET /search (query params `q`, optional `limit`).
 */

import "server-only";

import * as z from "zod";

type Database = import("better-sqlite3").Database;

import { member } from "../orpc";
import { db } from "../../db";
import { buildScopeFilter } from "../scope";
import { parseQuery, buildMatchExpression } from "../../lib/search-query";

// bm25 row weights: entity_id, type (both UNINDEXED), title (10×), body (1×).
const BM25_WEIGHTS = "0.0, 0.0, 10.0, 1.0";
// snippet(body, ...) — body is column index 3 in the virtual table.
const SNIPPET = `snippet(search_index, 3, '<mark>', '</mark>', '…', 12)`;

function getConn(): Database {
  return (db as unknown as { $client: Database }).$client;
}

const searchInput = z.object({
  q: z.string().max(500, "Query must be at most 500 characters"),
  limit: z.number().int().min(1).max(100).optional(),
});

interface SearchRow {
  id: string;
  type: string;
  title: string;
  place_id: string | null;
  place_title: string | null;
  snippet: string | null;
  score: number | null;
}

export const search = member
  .route({ method: "GET", path: "/search" })
  .input(searchInput)
  .handler(({ context, input }) => {
    const conn = getConn();
    const limit = input.limit ?? 20;

    const parsed = parseQuery(input.q);
    const matchExpr = buildMatchExpression(parsed.terms, parsed.prefix);
    const hasText = matchExpr !== "";

    // WHERE: visibility, scope, and the parsed filters.
    const whereClauses: string[] = [
      "e.deleted_at IS NULL",
      "e.archived_at IS NULL",
    ];
    const params: unknown[] = [];

    if (parsed.types.length > 0) {
      whereClauses.push(
        `si.type IN (${parsed.types.map(() => "?").join(",")})`,
      );
      params.push(...parsed.types);
    }

    // `place:<name>`: every place with that name, plus all of their
    // descendant subtrees (D10). Both parts use path-prefix ranges.
    for (const name of parsed.places) {
      whereClauses.push(
        `(
          e.id IN (
            SELECT p.entity_id FROM places p
            JOIN entities pe ON pe.id = p.entity_id
            WHERE pe.title = ? COLLATE NOCASE
          )
          OR EXISTS (
            SELECT 1 FROM places tgt
            JOIN entities te ON te.id = tgt.entity_id
            WHERE te.title = ? COLLATE NOCASE
              AND EXISTS (
                SELECT 1 FROM places ep
                WHERE ep.entity_id = e.place_id
                  AND ep.path >= tgt.path AND ep.path < tgt.path || '~'
              )
          )
        )`,
      );
      params.push(name, name);
    }

    for (const tagName of parsed.tags) {
      whereClauses.push(
        `EXISTS (
          SELECT 1 FROM entity_tags et
          JOIN tags t ON t.id = et.tag_id
          WHERE et.entity_id = e.id AND t.name = ? COLLATE NOCASE
        )`,
      );
      params.push(tagName);
    }

    for (const username of parsed.members) {
      whereClauses.push(
        `EXISTS (
          SELECT 1 FROM entity_assignees ea
          JOIN user u ON u.id = ea.user_id
          WHERE ea.entity_id = e.id AND u.username = ? COLLATE NOCASE
        )`,
      );
      params.push(username);
    }

    // Property scope (D7): the single shared scope filter.
    const scope = buildScopeFilter(conn, context.user.id, "e");
    if (scope.sql) {
      whereClauses.push(scope.sql);
      params.push(...scope.params);
    }

    const whereSQL = whereClauses.join(" AND ");

    const selectScore = hasText
      ? `, bm25(search_index, ${BM25_WEIGHTS}) AS score, ${SNIPPET} AS snippet`
      : "";
    const matchClause = hasText ? "AND search_index MATCH ?" : "";
    const orderBy = hasText ? "ORDER BY score" : "ORDER BY e.updated_at DESC, e.id DESC";
    const matchParams = hasText ? [matchExpr] : [];

    const rows = conn
      .prepare(
        `SELECT e.id, e.type, e.title, e.place_id, pe.title AS place_title
         ${selectScore}
         FROM search_index si
         JOIN entities e ON e.id = si.entity_id
         LEFT JOIN entities pe ON pe.id = e.place_id
         WHERE ${whereSQL}
         ${matchClause}
         ${orderBy}
         LIMIT ?`,
      )
      .all(...params, ...matchParams, limit) as SearchRow[];

    return {
      data: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        placeId: r.place_id,
        placeTitle: r.place_title,
        snippet: r.snippet,
        score: r.score,
      })),
    };
  });
