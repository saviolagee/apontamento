"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { MonthPoint } from "@/lib/server/metrics.types";
import type { HealthStatus } from "@/lib/profitability";

const axisStyle = { fontSize: 12, fill: "var(--viz-axis)" };
const gridStyle = { stroke: "var(--viz-grid)" };

const compactCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="flex items-center gap-2 text-muted-foreground">
          {row.color ? (
            <span className="size-2 rounded-full" style={{ background: row.color }} aria-hidden />
          ) : null}
          {row.label}: <span className="font-medium text-foreground">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Evolução mensal de receita líquida, custo e lucro (todos em R$: um eixo só). */
export function MonthlyResultChart({ data }: { data: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} {...gridStyle} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={gridStyle} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={compactCurrency} width={56} />
        <Tooltip
          cursor={{ stroke: "var(--viz-grid)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                title={String(label)}
                rows={payload.map((item) => ({
                  label: String(item.name),
                  value: formatCurrency(Number(item.value)),
                  color: item.color,
                }))}
              />
            ) : null
          }
        />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="revenue"
          name="Receita líquida"
          stroke="var(--viz-1)"
          strokeWidth={2}
          dot={false}
        />
        <Line type="monotone" dataKey="cost" name="Custo total" stroke="var(--viz-2)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="profit" name="Lucro" stroke="var(--viz-3)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Evolução da margem real contra a meta (eixo em %). */
export function MarginEvolutionChart({ data }: { data: MonthPoint[] }) {
  const points = data.map((d) => ({
    ...d,
    marginPct: d.margin === null ? null : d.margin * 100,
    targetPct: d.desiredMargin === null ? null : d.desiredMargin * 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} {...gridStyle} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={gridStyle} />
        <YAxis
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => `${Math.round(v)}%`}
        />
        <ReferenceLine y={0} stroke="var(--viz-axis)" />
        <Tooltip
          cursor={{ stroke: "var(--viz-grid)" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBox
                title={String(label)}
                rows={payload.map((item) => ({
                  label: String(item.name),
                  value: item.value === null ? "—" : formatPercent(Number(item.value) / 100),
                  color: item.color,
                }))}
              />
            ) : null
          }
        />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="marginPct"
          name="Margem real"
          stroke="var(--viz-1)"
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="targetPct"
          name="Margem desejada"
          stroke="var(--viz-2)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export type ScatterPoint = {
  name: string;
  revenue: number;
  marginPct: number;
  desiredPct: number;
  status: HealthStatus;
};

const STATUS_COLOR: Record<HealthStatus, string> = {
  saudavel: "var(--viz-good)",
  atencao: "var(--viz-warning)",
  critico: "var(--viz-critical)",
};

/** Matriz receita × margem: onde está o dinheiro e onde está a margem. */
export function RevenueMarginScatter({ data, targetPct }: { data: ScatterPoint[]; targetPct: number }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid {...gridStyle} />
        <XAxis
          type="number"
          dataKey="revenue"
          name="Receita líquida"
          tick={axisStyle}
          tickLine={false}
          axisLine={gridStyle}
          tickFormatter={compactCurrency}
        />
        <YAxis
          type="number"
          dataKey="marginPct"
          name="Margem real"
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v: number) => `${Math.round(v)}%`}
        />
        <ZAxis range={[80, 80]} />
        <ReferenceLine
          y={targetPct}
          stroke="var(--viz-axis)"
          strokeDasharray="4 4"
          label={{ value: "meta", position: "insideTopRight", fill: "var(--viz-axis)", fontSize: 11 }}
        />
        <Tooltip
          cursor={{ strokeDasharray: "3 3", stroke: "var(--viz-grid)" }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as ScatterPoint | undefined;
            return active && point ? (
              <TooltipBox
                title={point.name}
                rows={[
                  { label: "Receita líquida", value: formatCurrency(point.revenue) },
                  { label: "Margem real", value: formatPercent(point.marginPct / 100) },
                  { label: "Meta", value: formatPercent(point.desiredPct / 100) },
                ]}
              />
            ) : null;
          }}
        />
        <Scatter
          data={data}
          shape={(props: unknown) => {
            const { cx, cy, payload } = props as { cx: number; cy: number; payload: ScatterPoint };
            return (
              <g>
                <circle cx={cx} cy={cy} r={6} fill={STATUS_COLOR[payload.status]} stroke="var(--card)" strokeWidth={2} />
                <text x={cx + 10} y={cy + 4} fontSize={11} fill="var(--viz-axis)">
                  {payload.name}
                </text>
              </g>
            );
          }}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontais simples: legíveis sem legenda e sem depender de cor. */
export function BarList({
  items,
  formatValue,
}: {
  items: { id: string; label: string; value: number; hint?: string }[];
  formatValue: (value: number) => string;
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);

  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div key={item.id} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="tabular-nums font-medium">{formatValue(item.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full"
              style={{
                width: `${(Math.abs(item.value) / max) * 100}%`,
                background: item.value < 0 ? "var(--viz-critical)" : "var(--viz-1)",
              }}
            />
          </div>
          {item.hint ? <p className="text-xs text-muted-foreground">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
