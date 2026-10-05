/**
 * Tests for the search query parser (task 12.1, design D10).
 */

import { describe, it, expect } from "vitest";
import { parseQuery, buildMatchExpression } from "./search-query";

describe("parseQuery", () => {
  it("parses a type filter", () => {
    const q = parseQuery("type:notes-page");
    expect(q.types).toEqual(["notes-page"]);
    expect(q.terms).toEqual([]);
  });

  it("parses a tag filter", () => {
    const q = parseQuery("tag:kitchen");
    expect(q.tags).toEqual(["kitchen"]);
    expect(q.terms).toEqual([]);
  });

  it("parses an @member (assignee) filter", () => {
    const q = parseQuery("@sam");
    expect(q.members).toEqual(["sam"]);
    expect(q.terms).toEqual([]);
  });

  it("combines a place filter with free text: place:kitchen paint", () => {
    const q = parseQuery("place:kitchen paint");
    expect(q.places).toEqual(["kitchen"]);
    expect(q.terms).toEqual(["paint"]);
    // The last (and only) free-text term is prefix-matched.
    expect(q.prefix).toBe(true);
  });

  it("prefix-matches the last free-text term for search-as-you-type", () => {
    const q = parseQuery("alab");
    expect(q.terms).toEqual(["alab"]);
    expect(q.prefix).toBe(true);
  });

  it("treats only the last term as a prefix match", () => {
    const q = parseQuery("kitchen sink");
    expect(q.terms).toEqual(["kitchen", "sink"]);
    expect(q.prefix).toBe(true);
    // buildMatchExpression asserts the last term is the prefixed one.
    expect(buildMatchExpression(q.terms, q.prefix)).toBe('"kitchen" AND "sink"*');
  });

  it("combines multiple filters with free text", () => {
    const q = parseQuery("type:notes tag:home @sam paint");
    expect(q.types).toEqual(["notes"]);
    expect(q.tags).toEqual(["home"]);
    expect(q.members).toEqual(["sam"]);
    expect(q.terms).toEqual(["paint"]);
  });

  it("accepts quoted multi-word values", () => {
    const q = parseQuery('place:"Main House" paint');
    expect(q.places).toEqual(["Main House"]);
    expect(q.terms).toEqual(["paint"]);
  });

  it("ignores empty filter values", () => {
    const q = parseQuery("type: tag:");
    expect(q.types).toEqual([]);
    expect(q.tags).toEqual([]);
  });

  it("handles whitespace-only or empty input", () => {
    expect(parseQuery("").terms).toEqual([]);
    expect(parseQuery("   ").terms).toEqual([]);
    expect(parseQuery("").prefix).toBe(false);
  });
});

describe("buildMatchExpression", () => {
  it("returns empty for no free text", () => {
    expect(buildMatchExpression([], false)).toBe("");
  });

  it("prefixes the last term", () => {
    expect(buildMatchExpression(["alab"], true)).toBe('"alab"*');
  });

  it("escapes embedded double quotes in a term", () => {
    expect(buildMatchExpression(['a"b'], true)).toBe('"a""b"*');
  });

  it("quotes single terms without a prefix (exact match)", () => {
    expect(buildMatchExpression(["paint"], false)).toBe('"paint"');
  });
});
