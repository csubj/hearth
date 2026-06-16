import type { MetricEntry } from "@/db/schema";

export type MetricChartPoint = {
  recordedAt: string;
  value: number;
  label: string;
  note: string | null;
};

export function parseMetricNumericValue(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isNumericMetric(entries: Pick<MetricEntry, "value">[]): boolean {
  if (entries.length === 0) {
    return false;
  }
  return entries.every((entry) => parseMetricNumericValue(entry.value) !== null);
}

export function toMetricChartPoints(entries: MetricEntry[]): MetricChartPoint[] {
  return [...entries]
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
    .flatMap((entry) => {
      const value = parseMetricNumericValue(entry.value);
      if (value === null) {
        return [];
      }
      return [
        {
          recordedAt: entry.recordedAt.toISOString(),
          value,
          label: entry.recordedAt.toLocaleDateString(undefined, { dateStyle: "medium" }),
          note: entry.note,
        },
      ];
    });
}
