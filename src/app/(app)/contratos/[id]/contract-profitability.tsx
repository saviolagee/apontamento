import { EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { formatCurrency, formatDate, formatHours, formatPercent, todayISO } from "@/lib/format";
import { monthsInRange, resolvePeriod, type Period } from "@/lib/periods";
import { computeProfitability, projectClosing, suggestedRevenue, type ContractMetricsRow } from "@/lib/profitability";
import { getMonthlyEvolution } from "@/lib/server/metrics";
import { BarList, MarginEvolutionChart, MonthlyResultChart } from "../../dashboard/charts";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-medium tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export async function ContractProfitability({ contractId, period }: { contractId: string; period: Period }) {
  const { tenant } = await requireRole(["admin", "gestor"]);
  const supabase = await createClient();
  const options = { attentionTolerancePoints: Number(tenant.margin_attention_tolerance) || 0 };
  const today = todayISO();

  const [{ data: metrics }, { data: breakdown }, { data: entries }, evolution] = await Promise.all([
    supabase.rpc("contract_metrics", { p_from: period.from, p_to: period.to }),
    supabase.rpc("contract_hours_breakdown", { p_contract_id: contractId, p_from: period.from, p_to: period.to }),
    supabase
      .from("time_entries")
      .select("id, entry_date, minutes, description, status, billable, employees(full_name), activities(name)")
      .eq("contract_id", contractId)
      .gte("entry_date", period.from)
      .lte("entry_date", period.to)
      .order("entry_date", { ascending: false })
      .limit(20),
    getMonthlyEvolution(monthsInRange(resolvePeriod(today, { periodo: "ano" }).from, period.to), contractId),
  ]);

  const row = ((metrics ?? []) as ContractMetricsRow[]).find((m) => m.contract_id === contractId);
  if (!row) return null;

  const p = computeProfitability(row, options);
  const projection = projectClosing(row, p, { ...period, today }, options);
  const needed = suggestedRevenue(row, p);

  const byEmployee = new Map<string, number>();
  const byActivity = new Map<string, number>();
  const byArea = new Map<string, number>();
  for (const item of breakdown ?? []) {
    byEmployee.set(item.employee_name, (byEmployee.get(item.employee_name) ?? 0) + Number(item.hours));
    byActivity.set(item.activity_name, (byActivity.get(item.activity_name) ?? 0) + Number(item.hours));
    const area = item.area_name ?? "Sem área";
    byArea.set(area, (byArea.get(area) ?? 0) + Number(item.hours));
  }
  const toItems = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ id: label, label, value }));

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Rentabilidade · {period.label}</CardTitle>
            <CardDescription>
              Margem real {p.realMargin === null ? "—" : formatPercent(p.realMargin)} contra meta de{" "}
              {formatPercent(p.desiredMargin)}
              {p.marginGapPoints !== null
                ? ` (${p.marginGapPoints >= 0 ? "+" : ""}${p.marginGapPoints.toFixed(1)} p.p.)`
                : ""}
              .
            </CardDescription>
          </div>
          <StatusBadge status={p.status} />
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Receita líquida"
              value={formatCurrency(p.netRevenue)}
              hint={p.taxAmount > 0 ? `Bruta ${formatCurrency(p.revenue)} − impostos ${formatCurrency(p.taxAmount)}` : undefined}
            />
            <Metric
              label="Custo total"
              value={formatCurrency(p.totalCost)}
              hint={`Horas ${formatCurrency(p.laborCost)} · extras ${formatCurrency(p.expenseCost)}`}
            />
            <Metric
              label="Lucro"
              value={formatCurrency(p.profit)}
              hint={`Valor hora efetivo ${p.effectiveHourlyRate === null ? "—" : formatCurrency(p.effectiveHourlyRate)}`}
            />
            <Metric
              label="Horas apontadas"
              value={formatHours(p.hours)}
              hint={
                p.hoursLimit === null
                  ? "Sem custo hora da equipe"
                  : `Limite ${formatHours(p.hoursLimit)} · ${formatPercent(p.hoursConsumption ?? 0)} consumido`
              }
            />
          </div>

          {p.hoursLimit !== null ? (
            <div className="grid gap-1">
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${Math.min((p.hoursConsumption ?? 0) * 100, 100)}%`,
                    background:
                      (p.hoursConsumption ?? 0) >= 1
                        ? "var(--viz-critical)"
                        : (p.hoursConsumption ?? 0) >= 0.8
                          ? "var(--viz-warning)"
                          : "var(--viz-1)",
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Limite de horas para bater a meta: {formatHours(p.hoursLimit)} · apontadas {formatHours(p.hours)}
              </p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {projection ? (
              <div className="grid gap-1 rounded-lg border p-3">
                <p className="text-sm font-medium">Projeção de fechamento</p>
                <p className="text-sm text-muted-foreground">
                  {formatPercent(projection.elapsed)} do período decorrido. No ritmo atual:{" "}
                  {formatHours(projection.projectedHours)}, custo de {formatCurrency(projection.projectedTotalCost)} e
                  margem de {projection.projectedMargin === null ? "—" : formatPercent(projection.projectedMargin)}.
                </p>
                <StatusBadge status={projection.projectedStatus} className="w-fit" />
              </div>
            ) : null}

            {needed !== null ? (
              <div className="grid gap-1 rounded-lg border p-3">
                <p className="text-sm font-medium">Para bater a meta</p>
                <p className="text-sm text-muted-foreground">
                  Com o consumo atual de horas, o contrato precisaria faturar {formatCurrency(needed)} no período
                  {p.revenue > 0 ? ` (${formatPercent(needed / p.revenue - 1)} de reajuste)` : ""}.
                </p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Evolução mensal</CardTitle>
            <CardDescription>Receita líquida, custo e lucro deste contrato no ano.</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyResultChart data={evolution} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Margem mês a mês</CardTitle>
            <CardDescription>Contra a margem desejada do contrato.</CardDescription>
          </CardHeader>
          <CardContent>
            <MarginEvolutionChart data={evolution} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Horas por colaborador</CardTitle>
          </CardHeader>
          <CardContent>
            {byEmployee.size === 0 ? (
              <EmptyState>Sem horas no período.</EmptyState>
            ) : (
              <BarList items={toItems(byEmployee)} formatValue={formatHours} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Horas por atividade</CardTitle>
          </CardHeader>
          <CardContent>
            {byActivity.size === 0 ? (
              <EmptyState>Sem horas no período.</EmptyState>
            ) : (
              <BarList items={toItems(byActivity)} formatValue={formatHours} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Horas por área</CardTitle>
          </CardHeader>
          <CardContent>
            {byArea.size === 0 ? (
              <EmptyState>Sem horas no período.</EmptyState>
            ) : (
              <BarList items={toItems(byArea)} formatValue={formatHours} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos apontamentos</CardTitle>
          <CardDescription>Os 20 lançamentos mais recentes do período.</CardDescription>
        </CardHeader>
        <CardContent>
          {(entries ?? []).length === 0 ? (
            <EmptyState>Nenhum apontamento no período.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Atividade</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(entries ?? []).map((entry) => {
                  const employee = entry.employees as { full_name: string } | null;
                  const activity = entry.activities as { name: string } | null;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDate(entry.entry_date)}</TableCell>
                      <TableCell>{employee?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {activity?.name}
                        {entry.billable ? "" : " (não faturável)"}
                        {entry.description ? <span className="block text-xs">{entry.description}</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatHours(entry.minutes / 60)}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.status}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
