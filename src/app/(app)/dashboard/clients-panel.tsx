"use client";

import Link from "next/link";
import { useState } from "react";
import { LayoutGridIcon, TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency, formatHours, formatPercent } from "@/lib/format";
import { PERIODICITY_LABELS } from "@/lib/contracts";
import type { HealthStatus } from "@/lib/profitability";

export type PanelItem = {
  contractId: string;
  clientName: string;
  contractName: string;
  periodicity: keyof typeof PERIODICITY_LABELS;
  revenue: number;
  cost: number;
  profit: number;
  margin: number | null;
  desiredMargin: number;
  hours: number;
  hoursLimit: number | null;
  consumption: number | null;
  status: HealthStatus;
};

type SortKey = "profit" | "margin" | "revenue" | "consumption";

const SORT_LABELS: Record<SortKey, string> = {
  profit: "Lucro",
  margin: "Margem",
  revenue: "Receita",
  consumption: "Consumo de horas",
};

function ConsumptionBar({ consumption }: { consumption: number | null }) {
  if (consumption === null) {
    return <span className="text-xs text-muted-foreground">sem custo hora da equipe</span>;
  }
  const ratio = Math.min(consumption, 1);
  const color = consumption >= 1 ? "var(--viz-critical)" : consumption >= 0.8 ? "var(--viz-warning)" : "var(--viz-1)";
  return (
    <div className="grid gap-1">
      <div className="h-1.5 rounded-full bg-muted">
        <div className="h-1.5 rounded-full" style={{ width: `${ratio * 100}%`, background: color }} />
      </div>
      <span className="text-xs text-muted-foreground">{formatPercent(consumption)} do limite de horas</span>
    </div>
  );
}

export function ClientsPanel({ items }: { items: PanelItem[] }) {
  const [view, setView] = useState<"cards" | "tabela">("cards");
  const [sort, setSort] = useState<SortKey>("profit");

  const sorted = [...items].sort((a, b) => {
    const pick = (item: PanelItem) =>
      sort === "margin"
        ? (item.margin ?? -Infinity)
        : sort === "revenue"
          ? item.revenue
          : sort === "consumption"
            ? (item.consumption ?? -Infinity)
            : item.profit;
    return pick(b) - pick(a);
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>Clientes e contratos</CardTitle>
          <CardDescription>Margem real contra a desejada e consumo do limite de horas.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <Button
              key={key}
              size="xs"
              variant={sort === key ? "secondary" : "ghost"}
              onClick={() => setSort(key)}
            >
              {SORT_LABELS[key]}
            </Button>
          ))}
          <Button
            size="icon-sm"
            variant="outline"
            onClick={() => setView((v) => (v === "cards" ? "tabela" : "cards"))}
            aria-label={view === "cards" ? "Ver em tabela" : "Ver em cards"}
          >
            {view === "cards" ? <TableIcon /> : <LayoutGridIcon />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <EmptyState>Nenhum contrato com movimento no período.</EmptyState>
        ) : view === "cards" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((item) => (
              <Link
                key={item.contractId}
                href={`/contratos/${item.contractId}`}
                className="grid gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.clientName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.contractName} · {PERIODICITY_LABELS[item.periodicity]}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Receita</p>
                    <p className="tabular-nums">{formatCurrency(item.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Custo</p>
                    <p className="tabular-nums">{formatCurrency(item.cost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lucro</p>
                    <p className="tabular-nums font-medium">{formatCurrency(item.profit)}</p>
                  </div>
                </div>

                <p className="text-sm">
                  Margem <span className="font-medium">{item.margin === null ? "—" : formatPercent(item.margin)}</span>
                  <span className="text-muted-foreground"> · meta {formatPercent(item.desiredMargin)}</span>
                </p>

                <ConsumptionBar consumption={item.consumption} />
              </Link>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente / contrato</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead className="text-right">Meta</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead className="text-right">Consumo</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((item) => (
                <TableRow key={item.contractId}>
                  <TableCell>
                    <Link href={`/contratos/${item.contractId}`} className="font-medium hover:underline">
                      {item.clientName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{item.contractName}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.cost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.profit)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.margin === null ? "—" : formatPercent(item.margin)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatPercent(item.desiredMargin)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatHours(item.hours)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.consumption === null ? "—" : formatPercent(item.consumption)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
