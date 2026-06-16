import { describe, expect, it } from "vitest";
import { isNumericMetric, parseMetricNumericValue, toMetricChartPoints } from "./chart";

describe("parseMetricNumericValue", () => {
  it("parses integers and decimals", () => {
    expect(parseMetricNumericValue("42")).toBe(42);
    expect(parseMetricNumericValue("42.5")).toBe(42.5);
    expect(parseMetricNumericValue(" 1,234.5 ")).toBe(1234.5);
  });

  it("returns null for non-numeric text", () => {
    expect(parseMetricNumericValue("watered")).toBeNull();
    expect(parseMetricNumericValue("")).toBeNull();
    expect(parseMetricNumericValue("42 lbs")).toBeNull();
  });
});

describe("isNumericMetric", () => {
  it("is false with no entries", () => {
    expect(isNumericMetric([])).toBe(false);
  });

  it("is true when every entry is numeric", () => {
    expect(isNumericMetric([{ value: "10" }, { value: "12.5" }])).toBe(true);
  });

  it("is false when any entry is text", () => {
    expect(isNumericMetric([{ value: "10" }, { value: "skipped" }])).toBe(false);
  });
});

describe("toMetricChartPoints", () => {
  it("sorts points oldest to newest", () => {
    const points = toMetricChartPoints([
      {
        id: "2",
        metricId: "m1",
        value: "20",
        note: null,
        recordedAt: new Date("2026-02-01T12:00:00Z"),
        createdByUserId: "u1",
        createdAt: new Date("2026-02-01T12:00:00Z"),
      },
      {
        id: "1",
        metricId: "m1",
        value: "10",
        note: null,
        recordedAt: new Date("2026-01-01T12:00:00Z"),
        createdByUserId: "u1",
        createdAt: new Date("2026-01-01T12:00:00Z"),
      },
    ]);

    expect(points.map((point) => point.value)).toEqual([10, 20]);
  });
});
