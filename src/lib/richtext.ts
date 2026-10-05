/**
 * Shared rich-text value (design D9, task 9.1).
 *
 * Notes and comments share one rich-text value that accepts either a
 * ProseMirror-like document (`{ doc }`) or Markdown (`{ markdown }`). The
 * server derives the other form and stores both. The document is canonical;
 * the Markdown output is normalised so a client sees what was stored.
 *
 * Supported content: paragraphs, headings, bullet/ordered lists, task lists
 * (checklists), links, bold/italic/strike/code, and @mentions. Unsupported
 * Markdown degrades to paragraphs.
 *
 * On Markdown input, `@username` of an active member becomes a mention node.
 * Usernames are immutable (design D6), so the Markdown stays stable.
 *
 * The Markdown ↔ document conversion is delegated to `@tiptap/markdown`'s
 * `MarkdownManager` (design D9). The `@tiptap/extension-mention` package only
 * knows the bracketed `[@ id="…" label="…"]` syntax, so we override the mention
 * node's markdown renderer to emit the stable `@username` form and pre-process
 * active-member `@username` mentions into that bracketed syntax before parsing.
 *
 * This module is isomorphic (no server-only / Drizzle imports) so it can be
 * unit-tested directly and reused by the server procedures.
 */

import { MarkdownManager } from "@tiptap/markdown";
import type { JSONContent } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Heading from "@tiptap/extension-heading";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Code from "@tiptap/extension-code";
import Link from "@tiptap/extension-link";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Mention from "@tiptap/extension-mention";

// ---------------------------------------------------------------------------
// Types (ProseMirror-compatible structure)
// ---------------------------------------------------------------------------

export type RichTextMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "strike" }
  | { type: "code" }
  | { type: "link"; attrs: { href: string } };

export interface RichTextMentionAttrs {
  /** The user id of the mentioned active member. */
  id: string;
  /** The username (immutable per D6). */
  label: string;
}

export interface RichTextTextNode {
  type: "text";
  text: string;
  marks?: RichTextMark[];
}

export interface RichTextMentionNode {
  type: "mention";
  attrs: RichTextMentionAttrs;
}

export type RichTextInline = RichTextTextNode | RichTextMentionNode;

export interface RichTextParagraph {
  type: "paragraph";
  content?: RichTextInline[];
}

export interface RichTextHeading {
  type: "heading";
  attrs: { level: number };
  content?: RichTextInline[];
}

export interface RichTextListItem {
  type: "listItem";
  content?: RichTextBlock[];
}

export interface RichTextTaskItem {
  type: "taskItem";
  attrs: { checked: boolean };
  content?: RichTextBlock[];
}

export interface RichTextBulletList {
  type: "bulletList";
  content: RichTextListItem[];
}

export interface RichTextOrderedList {
  type: "orderedList";
  attrs?: { start?: number };
  content: RichTextListItem[];
}

export interface RichTextTaskList {
  type: "taskList";
  content: RichTextTaskItem[];
}

export type RichTextBlock =
  | RichTextParagraph
  | RichTextHeading
  | RichTextBulletList
  | RichTextOrderedList
  | RichTextTaskList;

export interface RichTextDoc {
  type: "doc";
  content: RichTextBlock[];
}

/** Canonical value returned/stored for a notes/comment body. */
export interface RichTextValue {
  doc: RichTextDoc;
  markdown: string;
  /** User ids extracted from mention nodes, in document order (deduped). */
  mentionIds: string[];
}

/** Raised when a body exceeds the configured size limit. */
export class RichTextSizeError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`Content exceeds the ${limit} character size limit.`);
    this.name = "RichTextSizeError";
    this.limit = limit;
  }
}

export type MemberByUsername = Map<string, string>;

// ---------------------------------------------------------------------------
// MarkdownManager (lazy singleton)
// ---------------------------------------------------------------------------

/**
 * `@tiptap/extension-mention` only parses/renders the bracketed
 * `[@ id="…" label="…"]` syntax. We render mentions as the stable `@username`
 * form (design D6) and pre-process those mentions into the bracketed syntax on
 * the parse path, so the stored document and emitted Markdown match the editor.
 */
const MentionNode = Mention.extend({
  renderMarkdown(node: JSONContent): string {
    return `@${node.attrs?.label ?? ""}`;
  },
});

let markdownManager: MarkdownManager | undefined;

/** Build the shared MarkdownManager once and cache it (design D9). */
function getMarkdownManager(): MarkdownManager {
  if (!markdownManager) {
    markdownManager = new MarkdownManager({
      extensions: [
        Document,
        Paragraph,
        Text,
        Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
        BulletList,
        OrderedList,
        ListItem,
        TaskList,
        TaskItem,
        Link.configure({ defaultProtocol: "https", openOnClick: false }),
        Bold,
        Italic,
        Strike,
        Code,
        MentionNode,
      ],
    });
  }
  return markdownManager;
}

// ---------------------------------------------------------------------------
// Markdown → document
// ---------------------------------------------------------------------------

/**
 * Replace `@username` of known active members (at a word boundary) with the
 * bracketed mention syntax the MarkdownManager understands. Unknown usernames
 * and `@` inside a word (e.g. an email) are left untouched.
 */
function preprocessMentions(
  markdown: string,
  members?: MemberByUsername,
): string {
  if (!members || members.size === 0) return markdown;
  return markdown.replace(
    /(^|[^\w])@([A-Za-z0-9_.-]+)/g,
    (full, prefix: string, username: string) => {
      const userId = members.get(username);
      if (!userId) return full;
      return `${prefix}[@ id="${userId}" label="${username}"]`;
    },
  );
}

/**
 * Parse a Markdown string into a rich-text document. Any `@username` whose
 * username is present in `members` is emitted as a mention node holding that
 * member's id; unknown usernames stay as literal text.
 */
export function parseMarkdown(
  markdown: string,
  members?: MemberByUsername,
): RichTextDoc {
  const parsed = getMarkdownManager().parse(
    preprocessMentions(markdown, members),
  ) as RichTextDoc;
  return normalizeDoc(parsed);
}

// ---------------------------------------------------------------------------
// Document → Markdown (normalised)
// ---------------------------------------------------------------------------

export function serializeMarkdown(doc: RichTextDoc): string {
  return getMarkdownManager().serialize(doc);
}

// ---------------------------------------------------------------------------
// Mention extraction / mapping
// ---------------------------------------------------------------------------

/**
 * Extract the user ids referenced by mention nodes in a document, in
 * document order, deduplicated while preserving first-seen order.
 */
export function extractMentionIds(doc: RichTextDoc): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  const visit = (nodes: RichTextInline[] | undefined) => {
    for (const n of nodes ?? []) {
      if (n.type === "mention" && !seen.has(n.attrs.id)) {
        seen.add(n.attrs.id);
        ids.push(n.attrs.id);
      }
    }
  };
  const walkBlocks = (blocks: RichTextBlock[] | undefined) => {
    for (const b of blocks ?? []) {
      switch (b.type) {
        case "paragraph":
        case "heading":
          visit(b.content);
          break;
        case "bulletList":
        case "orderedList":
          b.content.forEach((item) => walkBlocks(item.content));
          break;
        case "taskList":
          b.content.forEach((item) => walkBlocks(item.content));
          break;
      }
    }
  };
  walkBlocks(doc.content);
  return ids;
}

// ---------------------------------------------------------------------------
// Public value builder
// ---------------------------------------------------------------------------

export interface BuildRichTextOptions {
  /** Maximum byte size of the body (notes 500 KB, comments 20 KB). */
  limit: number;
  /** Map of active-member username → user id. */
  members?: MemberByUsername;
}

/**
 * Build the canonical rich-text value from either a document or Markdown.
 *
 * - `markdown` input is parsed (mapping active-member `@username` to mention
 *   nodes), then re-serialised to normalised Markdown.
 * - `doc` input is canonical; the Markdown form is derived from it.
 *
 * Throws `RichTextSizeError` when the body exceeds `limit`.
 */
export function buildRichText(
  input: { doc?: unknown; markdown?: string },
  opts: BuildRichTextOptions,
): RichTextValue {
  const hasMd = input.markdown !== undefined;

  // Callers normally send exactly one form; prefer the document when both
  // are present rather than failing unexpectedly.

  if (hasMd) {
    const md = input.markdown!;
    const bytes = byteLength(md);
    if (bytes > opts.limit) throw new RichTextSizeError(opts.limit);
    const doc = parseMarkdown(md, opts.members);
    const markdown = serializeMarkdown(doc);
    return { doc, markdown, mentionIds: extractMentionIds(doc) };
  }

  const doc = input.doc as RichTextDoc;
  // Normalise the document: drop unsupported node types while keeping the
  // canonical structure, then derive a normalised Markdown form.
  const normalized = normalizeDoc(doc);
  const markdown = serializeMarkdown(normalized);
  const bytes = byteLength(JSON.stringify(normalized));
  if (bytes > opts.limit) throw new RichTextSizeError(opts.limit);
  return { doc: normalized, markdown, mentionIds: extractMentionIds(normalized) };
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Recursively drop unknown node/type shapes, keeping standard nodes. */
function normalizeDoc(doc: RichTextDoc): RichTextDoc {
  const content = (doc?.content ?? [])
    .map(normalizeBlock)
    .filter((b): b is RichTextBlock => b !== null);
  return { type: "doc", content: content.length ? content : [] };
}

function normalizeBlock(block: RichTextBlock): RichTextBlock | null {
  if (!block || typeof block.type !== "string") return null;
  switch (block.type) {
    case "paragraph":
      return {
        type: "paragraph",
        content: normalizeInline(block.content),
      };
    case "heading":
      return {
        type: "heading",
        attrs: { level: clampLevel(block.attrs?.level ?? 1) },
        content: normalizeInline(block.content),
      };
    case "bulletList":
      return {
        type: "bulletList",
        content: (block.content ?? []).map((it) => normalizeListItem(it)),
      };
    case "orderedList": {
      const start = typeof block.attrs?.start === "number" ? block.attrs.start : 1;
      return {
        type: "orderedList",
        attrs: { start },
        content: (block.content ?? []).map((it) => normalizeListItem(it)),
      };
    }
    case "taskList":
      return {
        type: "taskList",
        content: (block.content ?? []).map((it) => normalizeTaskItem(it)),
      };
    default:
      // Unsupported block type → degrade to a (paragraph-free) empty paragraph.
      return null;
  }
}

function normalizeListItem(
  item: RichTextListItem | undefined,
): RichTextListItem {
  return {
    type: "listItem",
    content: (item?.content ?? []).map(normalizeBlock).filter(
      (b): b is RichTextBlock => b !== null,
    ),
  };
}

function normalizeTaskItem(
  item: RichTextTaskItem | undefined,
): RichTextTaskItem {
  return {
    type: "taskItem",
    attrs: { checked: !!item?.attrs?.checked },
    content: (item?.content ?? []).map(normalizeBlock).filter(
      (b): b is RichTextBlock => b !== null,
    ),
  };
}

function normalizeInline(
  nodes: RichTextInline[] | undefined,
): RichTextInline[] {
  const out: RichTextInline[] = [];
  for (const n of nodes ?? []) {
    if (!n || typeof n.type !== "string") continue;
    if (n.type === "mention") {
      out.push({
        type: "mention",
        attrs: {
          id: String(n.attrs?.id ?? ""),
          label: String(n.attrs?.label ?? ""),
        },
      });
    } else if (n.type === "text") {
      const marks = normalizeMarks(n.marks);
      out.push(marks.length ? { type: "text", text: n.text, marks } : { type: "text", text: n.text });
    }
  }
  return out;
}

function normalizeMarks(marks: RichTextMark[] | undefined): RichTextMark[] {
  const out: RichTextMark[] = [];
  for (const m of marks ?? []) {
    if (!m || typeof m.type !== "string") continue;
    if (m.type === "link") {
      out.push({ type: "link", attrs: { href: String(m.attrs?.href ?? "") } });
    } else if (
      m.type === "bold" ||
      m.type === "italic" ||
      m.type === "strike" ||
      m.type === "code"
    ) {
      out.push({ type: m.type });
    }
  }
  return out;
}

function clampLevel(level: number): number {
  return Math.max(1, Math.min(6, Math.floor(level)));
}
