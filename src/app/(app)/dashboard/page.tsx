import Link from "next/link";
import {
  AlertTriangleIcon,
  InfoIcon,
  OctagonAlertIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ExportMenu } from "@/components/export-menu";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { formatCurrency, formatHours, formatPercent, todayISO } from "@/lib/format";
import { monthsInRange, resolvePeriod } from "@/lib/periods";
import { buildAlerts, type AlertLevel } from "@/lib/alerts";
import { HEALTH_LABELS, type HealthStatus } from "@/lib/profitability";
import {
  getActivityMetrics,
  getAreaReport,
  getEmployeeClientCost,
  getEmployeeMetrics,
  getMissingCosts,
  getMonthlyEvolution,
  getPendingApprovalsCount,
  getProfitabilityReport,
} from "@/lib/server/metrics";
import { BarList, MarginEvolutionChart, MonthlyResultChart, RevenueMarginScatter } from "./charts";
import { ClientsPanel, type PanelItem } from "./clients-panel";
import { PeriodFilter } from "./period-filter";

export const metadata = { title: "Rentabilidade | Apontamento" };

const ALERT_ICON: Record<AlertLevel, React.ComponentType<{ className?: string }>> = {
  critico: OctagonAlertIcon,
  atencao: AlertTriangleIcon,
  info: InfoIcon,
};

const ALERT_COLOR: Record<AlertLevel, string> = {
  critico: "text-[--viz-critical]",
  atencao: "text-[#8a6200] dark:text-[--viz-warning]",
  info: "text-muted-foreground",
};

function Kpi({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        {children}
      </CardHeader>
    </Card>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  await requireRole(["admin", "gestor"]);

  const today = todayISO();
  const period = resolvePeriod(today, {
    periodo: typeof params.periodo === "string" ? params.periodo : undefined,
    de: typeof params.de === "string" ? params.de : undefined,
    ate: typeof params.ate === "string" ? params.ate : undefined,
  });

  const report = await getProfitabilityReport(period);
  const [employees, missingCosts, pendingCount, areas, activities, employeeClients, evolution] = await Promise.all([
    getEmployeeMetrics(period),
    getMissingCosts(),
    getPendingApprovalsCount(),
    getAreaReport(period, report.contracts),
    getActivityMetrics(period),
    getEmployeeClientCost(period),
    getMonthlyEvolution(monthsInRange(monthsBack(period.from, 5), period.to)),
  ]);

  const totals = report.totals;
  const alerts = buildAlerts({
    contracts: report.contracts,
    employees: employees.map((e) => ({
      employee_id: e.employee_id,
      employee_name: e.employee_name,
      hours: Number(e.hours),
      last_entry_date: e.last_entry_date,
    })),
    missingCosts,
    pendingCount,
    today,
  });

  const byStatus = report.contracts.reduce<Record<HealthStatus, number>>(
    (acc, item) => {
      acc[item.profitability.status] += 1;
      return acc;
    },
    { saudavel: 0, atencao: 0, critico: 0 },
  );

  const panelItems: PanelItem[] = report.contracts.map(({ row, profitability }) => ({
    contractId: row.contract_id,
    clientName: row.client_name,
    contractName: row.contract_name,
    periodicity: row.periodicity,
    revenue: profitability.netRevenue,
    cost: profitability.totalCost,
    profit: profitability.profit,
    margin: profitability.realMargin,
    desiredMargin: profitability.desiredMargin,
    hours: profitability.hours,
    hoursLimit: profitability.hoursLimit,
    consumption: profitability.hoursConsumption,
    status: profitability.status,
  }));

  const scatter = report.contracts
    .filter((c) => c.profitability.realMargin !== null)
    .map((c) => ({
      name: c.row.client_name,
      revenue: c.profitability.netRevenue,
      marginPct: (c.profitability.realMargin ?? 0) * 100,
      desiredPct: c.profitability.desiredMargin * 100,
      status: c.profitability.status,
    }));

  const ranking = [...report.contracts].sort((a, b) => b.profitability.profit - a.profitability.profit);
  const worstMargin = [...report.contracts]
    .filter((c) => c.profitability.realMargin !== null)
    .sort((a, b) => (a.profitability.realMargin ?? 0) - (b.profitability.realMargin ?? 0));

  const totalHours = employees.reduce((sum, e) => sum + Number(e.hours), 0);
  const availableHours = employees.reduce((sum, e) => sum + Number(e.available_hours), 0);
  const billableShare = totals.hours > 0 ? totals.billableHours / totals.hours : 0;

  // Concentração: participação dos 3 maiores clientes na receita
  const revenueByClient = new Map<string, number>();
  for (const { row, profitability } of report.contracts) {
    revenueByClient.set(row.client_name, (revenueByClient.get(row.client_name) ?? 0) + profitability.netRevenue);
  }
  const topClients = [...revenueByClient.entries()].sort((a, b) => b[1] - a[1]);
  const concentration =
    totals.netRevenue > 0 ? topClients.slice(0, 3).reduce((sum, [, v]) => sum + v, 0) / totals.netRevenue : 0;

  const adjustments = report.contracts
    .filter((c) => c.adjustment !== null && c.adjustment > 0.01)
    .sort((a, b) => (b.adjustment ?? 0) - (a.adjustment ?? 0))
    .slice(0, 6);

  return (
    <div className="grid gap-6">
      <PageHeader title="Rentabilidade" description={`${period.label} · ${report.contracts.length} contrato(s)`}>
        <div className="flex flex-wrap gap-2">
          <ExportMenu dataset="rentabilidade" label="Exportar rentabilidade" />
          <ExportMenu dataset="apontamentos" label="Apontamentos" scope="todos" />
          <ExportMenu dataset="equipe" label="Equipe" />
        </div>
      </PageHeader>

      <PeriodFilter preset={period.preset} from={period.from} to={period.to} />

      {alerts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Alertas</CardTitle>
            <CardDescription>O que precisa de atenção agora.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {alerts.slice(0, 8).map((alert) => {
              const Icon = ALERT_ICON[alert.level];
              const content = (
                <div className="flex items-start gap-2 rounded-lg border px-3 py-2">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${ALERT_COLOR[alert.level]}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">{alert.detail}</p>
                  </div>
                </div>
              );
              return alert.href ? (
                <Link key={alert.id} href={alert.href} className="block transition-colors hover:bg-muted/40">
                  {content}
                </Link>
              ) : (
                <div key={alert.id}>{content}</div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Receita líquida"
          value={formatCurrency(totals.netRevenue)}
          hint={`Bruta ${formatCurrency(totals.revenue)} · impostos ${formatCurrency(totals.taxAmount)}`}
        />
        <Kpi
          label="Custo total"
          value={formatCurrency(totals.totalCost)}
          hint={`Horas ${formatCurrency(totals.laborCost)} · extras ${formatCurrency(totals.expenseCost)}`}
        />
        <Kpi label="Lucro" value={formatCurrency(totals.profit)}>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {(totals.marginGapPoints ?? 0) >= 0 ? (
              <TrendingUpIcon className="size-3 text-[--viz-good]" />
            ) : (
              <TrendingDownIcon className="size-3 text-[--viz-critical]" />
            )}
            Margem {totals.realMargin === null ? "—" : formatPercent(totals.realMargin)} · meta{" "}
            {formatPercent(totals.desiredMargin)}
          </p>
        </Kpi>
        <Kpi
          label="Horas apontadas"
          value={formatHours(totals.hours)}
          hint={`${formatPercent(billableShare)} faturáveis · valor hora ${
            totals.effectiveHourlyRate === null ? "—" : formatCurrency(totals.effectiveHourlyRate)
          }`}
        >
          <div className="flex flex-wrap gap-1 pt-1">
            {(Object.keys(byStatus) as HealthStatus[]).map((status) =>
              byStatus[status] > 0 ? (
                <span key={status} className="flex items-center gap-1">
                  <StatusBadge status={status} />
                  <span className="text-xs text-muted-foreground">
                    {byStatus[status]} {byStatus[status] === 1 ? "contrato" : "contratos"}
                  </span>
                </span>
              ) : null,
            )}
          </div>
        </Kpi>
      </div>

      <ClientsPanel items={panelItems} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Evolução mensal</CardTitle>
            <CardDescription>Receita líquida, custo total e lucro nos últimos meses.</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyResultChart data={evolution} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Margem da empresa</CardTitle>
            <CardDescription>Margem real contra a meta ponderada pelos contratos.</CardDescription>
          </CardHeader>
          <CardContent>
            <MarginEvolutionChart data={evolution} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receita × margem</CardTitle>
          <CardDescription>
            Quadrante inferior direito = cliente grande com margem baixa: é onde renegociar primeiro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scatter.length === 0 ? (
            <EmptyState>Sem contratos com receita no período.</EmptyState>
          ) : (
            <RevenueMarginScatter data={scatter} targetPct={totals.desiredMargin * 100} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rentabilidade por área</CardTitle>
            <CardDescription>Receita rateada pelas horas apontadas em cada área.</CardDescription>
          </CardHeader>
          <CardContent>
            {areas.length === 0 ? (
              <EmptyState>Sem horas apontadas no período.</EmptyState>
            ) : (
              <BarList
                items={areas.map((area) => ({
                  id: area.id,
                  label: area.name,
                  value: area.profit,
                  hint: `${formatHours(area.hours)} · margem ${area.margin === null ? "—" : formatPercent(area.margin)}`,
                }))}
                formatValue={formatCurrency}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custo por atividade</CardTitle>
            <CardDescription>Quais atividades mais consomem margem.</CardDescription>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <EmptyState>Sem horas apontadas no período.</EmptyState>
            ) : (
              <BarList
                items={activities.slice(0, 8).map((a) => ({
                  id: a.activity_id,
                  label: a.activity_name,
                  value: Number(a.labor_cost),
                  hint: `${formatHours(Number(a.hours))} · ${a.billable ? "faturável" : "não faturável"} · ${a.area_name}`,
                }))}
                formatValue={formatCurrency}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Utilização da equipe</CardTitle>
            <CardDescription>
              {formatHours(totalHours)} apontadas de {formatHours(availableHours)} disponíveis
              {availableHours > 0 ? ` (${formatPercent(totalHours / availableHours)})` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {employees.length === 0 ? (
              <EmptyState>Nenhum colaborador ativo.</EmptyState>
            ) : (
              <BarList
                items={employees.map((e) => ({
                  id: e.employee_id,
                  label: e.employee_name,
                  value: Number(e.available_hours) > 0 ? Number(e.hours) / Number(e.available_hours) : 0,
                  hint: `${formatHours(Number(e.hours))} · ${
                    Number(e.hours) > 0
                      ? `${formatPercent(Number(e.billable_hours) / Number(e.hours))} faturável`
                      : "sem apontamentos"
                  }`,
                }))}
                formatValue={(v) => formatPercent(v)}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maior custo alocado por cliente</CardTitle>
            <CardDescription>Quem está consumindo a margem de cada cliente.</CardDescription>
          </CardHeader>
          <CardContent>
            {employeeClients.length === 0 ? (
              <EmptyState>Sem horas apontadas em contratos.</EmptyState>
            ) : (
              <BarList
                items={employeeClients.slice(0, 8).map((e) => ({
                  id: `${e.employee_id}-${e.client_id}`,
                  label: `${e.employee_name} → ${e.client_name}`,
                  value: Number(e.labor_cost),
                  hint: formatHours(Number(e.hours)),
                }))}
                formatValue={formatCurrency}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Mais rentáveis</CardTitle>
            <CardDescription>Maior lucro no período.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {ranking.slice(0, 5).map(({ row, profitability }) => (
              <Link
                key={row.contract_id}
                href={`/contratos/${row.contract_id}`}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/40"
              >
                <span className="truncate">{row.client_name}</span>
                <span className="tabular-nums font-medium">{formatCurrency(profitability.profit)}</span>
              </Link>
            ))}
            {ranking.length === 0 ? <EmptyState>Sem dados.</EmptyState> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Menores margens</CardTitle>
            <CardDescription>Onde a meta está mais longe.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {worstMargin.slice(0, 5).map(({ row, profitability }) => (
              <Link
                key={row.contract_id}
                href={`/contratos/${row.contract_id}`}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/40"
              >
                <span className="truncate">{row.client_name}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{formatPercent(profitability.realMargin ?? 0)}</span>
                  <StatusBadge status={profitability.status} />
                </span>
              </Link>
            ))}
            {worstMargin.length === 0 ? <EmptyState>Sem dados.</EmptyState> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sugestão de reajuste</CardTitle>
            <CardDescription>Aumento necessário para atingir a margem desejada.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {adjustments.map(({ row, adjustment, profitability }) => (
              <Link
                key={row.contract_id}
                href={`/contratos/${row.contract_id}`}
                className="grid gap-0.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted/40"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">{row.client_name}</span>
                  <span className="tabular-nums font-medium">+{formatPercent(adjustment ?? 0)}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  De {formatCurrency(profitability.revenue)} para{" "}
                  {formatCurrency(profitability.revenue * (1 + (adjustment ?? 0)))} no período
                </span>
              </Link>
            ))}
            {adjustments.length === 0 ? (
              <EmptyState>Todos os contratos já cobrem a margem desejada.</EmptyState>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Concentração de receita</CardTitle>
          <CardDescription>
            Os 3 maiores clientes representam {formatPercent(concentration)} da receita líquida do período.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topClients.length === 0 ? (
            <EmptyState>Sem receita no período.</EmptyState>
          ) : (
            <BarList
              items={topClients.slice(0, 8).map(([name, value]) => ({
                id: name,
                label: name,
                value,
                hint: totals.netRevenue > 0 ? formatPercent(value / totals.netRevenue) : undefined,
              }))}
              formatValue={formatCurrency}
            />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Status: 🟢 {HEALTH_LABELS.saudavel} (margem ≥ meta) · 🟡 {HEALTH_LABELS.atencao} (até {report.tolerance} p.p.
        abaixo) · 🔴 {HEALTH_LABELS.critico} (abaixo disso ou prejuízo). Ajuste a tolerância em Configurações → Empresa.
      </p>
    </div>
  );
}

/** Primeiro dia do mês, `count` meses antes da data informada. */
function monthsBack(iso: string, count: number): string {
  const [year, month] = iso.split("-").map(Number);
  const total = year * 12 + (month - 1) - count;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}
