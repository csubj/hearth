/**
 * Search query parser (design D10, task 12.1).
 *
 * Turns a raw search string into a set of filters plus free text for the
 * FTS5 search procedure. It understands:
 *
 *   type:<module>    — restrict to a module type (may appear multiple times)
 *   place:<name>     — every place with that name + their subtrees
 *   tag:<name>       — entities carrying a tag by (case-insensitive) name
 *   @<member>        — entities assigned to a member by username
 *
 * Every other token is free text; the LAST free-text term is a prefix match
 * (`term*`) so results appear as the member types (search-as-you-type).
 * Multiple filters combine with free text using AND semantics downstream.
 *
 * Double-quoted values are supported (e.g. `place:"Main House"`, or
 * `place:"Main House" paint`) so multi-word names survive the tokenizer.
 */

export interface ParsedQuery {
  /** `type:` filter values. */
  types: string[];
  /** `place:` filter values (place names). */
  places: string[];
  /** `tag:` filter values (tag names). */
  tags: string[];
  /** `@member` filter values (usernames). */
  members: string[];
  /** Free-text terms (no filter prefixes). */
  terms: string[];
  /**
   * Whether the last free-text term should be prefix-matched (`term*`).
   * True whenever there is at least one free-text term.
   */
  prefix: boolean;
}

/**
 * Split a string on whitespace, honouring double-quoted spans (which may
 * contain spaces). Quotes are removed from the returned tokens, and quoted
 * spans may be joined directly to a filter prefix (e.g. `place:"Main House"`
 * produces a single `place:Main House` token).
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue; // drop the quote character
    }
    if (!inQuotes && (ch === " " || ch === "\t" || ch === "\n")) {
      if (current !== "") {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current !== "") tokens.push(current);

  return tokens;
}

/**
 * Parse a search string into filters + free text.
 *
 * @param raw - The user's input, e.g. `place:kitchen paint` or `@sam type:notes`.
 * @returns A `ParsedQuery` describing the filters and free text.
 */
export function parseQuery(raw: string): ParsedQuery {
  const types: string[] = [];
  const places: string[] = [];
  const tags: string[] = [];
  const members: string[] = [];
  const terms: string[] = [];

  const tokens = tokenize(raw ?? "");

  for (const tok of tokens) {
    // `@member` — assigned-to filter.
    if (tok.startsWith("@")) {
      const username = tok.slice(1);
      if (username) members.push(username);
      continue;
    }

    // `type:`, `place:`, `tag:` filters.
    const filter = tok.match(/^(type|place|tag):(.*)$/i);
    if (filter) {
      const key = filter[1]!.toLowerCase();
      const value = filter[2]!.trim();
      if (!value) continue;
      if (key === "type") types.push(value);
      else if (key === "place") places.push(value);
      else tags.push(value);
      continue;
    }

    // Free text.
    terms.push(tok);
  }

  return {
    types,
    places,
    tags,
    members,
    terms,
    // Search-as-you-type: the last free-text term is a prefix match.
    prefix: terms.length > 0,
  };
}

/**
 * Build the FTS5 MATCH expression for the free-text terms.
 *
 * Each term is quoted so it is treated as a token/phrase, and terms are
 * ANDed together. When `prefix` is set, the last term is appended with `*`
 * (FTS5 prefix query) for search-as-you-type.
 *
 * Returns an empty string when there is no free text.
 */
export function buildMatchExpression(
  terms: string[],
  prefix: boolean,
): string {
  if (terms.length === 0) return "";
  const expressions = terms.map((term, i) => {
    const quoted = `"${term.replace(/"/g, '""')}"`;
    if (prefix && i === terms.length - 1) {
      return `${quoted}*`;
    }
    return quoted;
  });
  return expressions.join(" AND ");
}
