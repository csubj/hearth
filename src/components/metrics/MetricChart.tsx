"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toMetricChartPoints } from "@/components/metrics/chart";
import type { MetricEntry } from "@/db/schema";

type MetricChartProps = {
  unit: string | null;
  entries: MetricEntry[];
};

function formatTooltipValue(value: number, unit: string | null): string {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function MetricChart({ unit, entries }: MetricChartProps) {
  const data = toMetricChartPoints(entries);

  if (data.length === 0) {
    return null;
  }

  return (
    <section
      className="rounded-lg border border-border bg-surface p-4 shadow-card"
      aria-label="Metric trend chart"
    >
      <div className="h-60 w-full md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border)" }}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border)" }}
              width={48}
              label={
                unit
                  ? {
                      value: unit,
                      angle: -90,
                      position: "insideLeft",
                      fill: "var(--color-text-muted)",
                      fontSize: 12,
                    }
                  : undefined
              }
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) {
                  return null;
                }
                const point = payload[0]?.payload as (typeof data)[number] | undefined;
                if (!point) {
                  return null;
                }
                return (
                  <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-card">
                    <p className="font-medium text-text">{formatTooltipValue(point.value, unit)}</p>
                    <p className="text-text-muted">{point.label}</p>
                    {point.note ? <p className="mt-1 text-text-muted">{point.note}</p> : null}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={{ fill: "var(--color-accent)", r: 4 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
