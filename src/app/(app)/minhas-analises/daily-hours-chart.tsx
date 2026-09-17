"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatHours } from "@/lib/format";

const axisStyle = { fontSize: 12, fill: "var(--viz-axis)" };

/** Horas por dia contra a jornada esperada (uma série: sem legenda). */
export function DailyHoursChart({
  data,
  dailyTarget,
}: {
  data: { date: string; hours: number }[];
  dailyTarget: number;
}) {
  const points = data.map((d) => ({ ...d, label: d.date.slice(8, 10) + "/" + d.date.slice(5, 7) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={{ stroke: "var(--viz-grid)" }} />
        <YAxis
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          width={36}
          tickFormatter={(v: number) => `${v}h`}
        />
        <ReferenceLine
          y={dailyTarget}
          stroke="var(--viz-2)"
          strokeDasharray="4 4"
          label={{ value: "jornada", position: "insideTopRight", fill: "var(--viz-axis)", fontSize: 11 }}
        />
        <Tooltip
          cursor={{ fill: "var(--viz-grid)", opacity: 0.4 }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as { date: string; hours: number } | undefined;
            return active && point ? (
              <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
                <p className="font-medium">{formatDate(point.date)}</p>
                <p className="text-muted-foreground">{formatHours(point.hours)} apontadas</p>
              </div>
            ) : null;
          }}
        />
        <Bar dataKey="hours" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
