import { describe, expect, it } from "vitest";
import { formatEventDate, toDatetimeLocalValue } from "@/components/events/format";

describe("event format helpers", () => {
  it("formats event dates for display", () => {
    const formatted = formatEventDate(new Date("2026-06-21T15:30:00"));
    expect(formatted).toContain("Jun");
    expect(formatted).toContain("21");
  });

  it("converts dates to datetime-local values", () => {
    const value = toDatetimeLocalValue(new Date("2026-06-21T15:30:00"));
    expect(value).toBe("2026-06-21T15:30");
  });
});
