/**
 * Unit tests for the shared rich-text value (task 9.1, design D9).
 *
 * Covers: headings / lists / checklists / links round-trip, `@username` of an
 * active member becoming a mention node, mention id extraction, and the size
 * limits (notes 500 KB, comments 20 KB).
 */

import { describe, it, expect } from "vitest";
import {
  buildRichText,
  parseMarkdown,
  serializeMarkdown,
  extractMentionIds,
  RichTextSizeError,
} from "./richtext";

const members = new Map<string, string>([
  ["sam", "u-sam"],
  ["cj", "u-cj"],
]);

const NOTES_LIMIT = 500 * 1024;
const COMMENTS_LIMIT = 20 * 1024;

describe("9.1 rich text", () => {
  it("round-trips headings, bullet lists, ordered lists and links", () => {
    const md = [
      "# Title line",
      "",
      "A paragraph with a [link](https://example.com).",
      "",
      "- alpha",
      "- beta",
      "",
      "1. first",
      "2. second",
    ].join("\n");

    const doc = parseMarkdown(md, members);
    const out = serializeMarkdown(doc);
    const round = parseMarkdown(out, members);

    expect(round.content[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    const blockTypes = round.content.map((b) => b.type);
    expect(blockTypes).toContain("bulletList");
    expect(blockTypes).toContain("orderedList");
    // Link survives: a paragraph contains a text node with a link mark.
    const paragraph = round.content.find((b) => b.type === "paragraph") as
      | { type: "paragraph"; content?: unknown[] }
      | undefined;
    const texts = JSON.stringify(paragraph?.content ?? []);
    expect(texts).toContain("https://example.com");
  });

  it("round-trips checklists (task lists)", () => {
    const md = "- [ ] open task\n- [x] done task";
    const doc = parseMarkdown(md, members);
    const out = serializeMarkdown(doc);
    const round = parseMarkdown(out, members);

    const taskList = round.content.find((b) => b.type === "taskList");
    expect(taskList).toBeDefined();
    const items = (taskList as { content: Array<{ attrs: { checked: boolean } }> }).content;
    expect(items[0]!.attrs.checked).toBe(false);
    expect(items[1]!.attrs.checked).toBe(true);
    // Normalised output keeps the checkbox syntax.
    expect(out).toContain("- [ ] open task");
    expect(out).toContain("- [x] done task");
  });

  it("maps @username of an active member to a mention node", () => {
    const value = buildRichText(
      { markdown: "Hey @sam, can you look at this?" },
      { limit: NOTES_LIMIT, members },
    );
    const mentions = value.doc.content.flatMap((b) =>
      b.type === "paragraph" ? (b.content ?? []) : [],
    );
    const mention = mentions.find((n) => n.type === "mention");
    expect(mention).toMatchObject({
      type: "mention",
      attrs: { id: "u-sam", label: "sam" },
    });
    expect(extractMentionIds(value.doc)).toEqual(["u-sam"]);
    // Markdown output is stable (username preserved).
    expect(value.markdown).toContain("@sam");
  });

  it("keeps an unknown @username as plain text", () => {
    const value = buildRichText(
      { markdown: "hi @nobody" },
      { limit: NOTES_LIMIT, members },
    );
    expect(extractMentionIds(value.doc)).toEqual([]);
    expect(value.markdown).toContain("@nobody");
  });

  it("does not treat an email-like @ inside a word as a mention", () => {
    const value = buildRichText(
      { markdown: "contact me at cj@shopping.example" },
      { limit: NOTES_LIMIT, members },
    );
    expect(extractMentionIds(value.doc)).toEqual([]);
  });

  it("derives a canonical document from a provided doc and extracts mentions", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "mention", attrs: { id: "u-cj", label: "cj" } }] },
      ],
    };
    const value = buildRichText({ doc }, { limit: NOTES_LIMIT, members });
    expect(value.markdown).toBe("@cj");
    expect(value.mentionIds).toEqual(["u-cj"]);
  });

  it("rejects notes over 500 KB", () => {
    const big = "# " + "x".repeat(NOTES_LIMIT + 1);
    expect(() =>
      buildRichText({ markdown: big }, { limit: NOTES_LIMIT, members }),
    ).toThrow(RichTextSizeError);
  });

  it("rejects comments over 20 KB", () => {
    const big = "# " + "x".repeat(COMMENTS_LIMIT + 1);
    expect(() =>
      buildRichText({ markdown: big }, { limit: COMMENTS_LIMIT, members }),
    ).toThrow(RichTextSizeError);
  });

  it("accepts sizes at the limit boundary", () => {
    const ok = "# " + "x".repeat(NOTES_LIMIT - 2);
    expect(() => buildRichText({ markdown: ok }, { limit: NOTES_LIMIT, members })).not.toThrow();
  });
});
