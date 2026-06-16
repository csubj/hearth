import { describe, expect, it } from "vitest";
import { parseMentions, type MentionCandidate } from "@/lib/mentions/parse";

const users: MentionCandidate[] = [
  { id: "u1", username: "alex", displayName: "Alex" },
  { id: "u2", username: "sam", displayName: "Sam Smith" },
];

describe("parseMentions", () => {
  it("returns empty for no mentions", () => {
    expect(parseMentions("hello world", users)).toEqual([]);
  });

  it("matches username case-insensitively", () => {
    expect(parseMentions("ping @Alex please", users)).toEqual(["u1"]);
  });

  it("matches display name with underscores", () => {
    expect(parseMentions("hey @sam_smith", users)).toEqual(["u2"]);
  });

  it("ignores unknown mentions", () => {
    expect(parseMentions("@unknown and @alex", users)).toEqual(["u1"]);
  });

  it("dedupes multiple mentions of the same user", () => {
    expect(parseMentions("@alex @ALEX", users)).toEqual(["u1"]);
  });

  it("handles punctuation after mention", () => {
    expect(parseMentions("Thanks @alex, great job!", users)).toEqual(["u1"]);
  });

  it("parses multiple distinct mentions", () => {
    expect(parseMentions("@alex and @sam", users)).toEqual(["u1", "u2"]);
  });
});
