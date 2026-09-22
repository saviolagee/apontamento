import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { requireContext, ROLE_LABELS } from "@/lib/auth/session";
import { formatCurrency, formatHours, formatPercent, todayISO } from "@/lib/format";
import { resolvePeriod } from "@/lib/periods";
import { getProfitabilityReport } from "@/lib/server/metrics";
import type { HealthStatus } from "@/lib/profitability";

export const metadata = { title: "Início | Apontamento" };

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardHeader>
    </Card>
  );
}

export default async function HomePage() {
  const { profile, tenant } = await requireContext();
  const isManager = profile.role === "admin" || profile.role === "gestor";

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {profile.full_name.split(" ")[0]}</h1>
        <p className="text-muted-foreground">
          Você está em <span className="font-medium text-foreground">{tenant.name}</span> como{" "}
          {ROLE_LABELS[profile.role]}.
        </p>
      </header>

      {isManager ? <ManagerSummary /> : <CollaboratorSummary monthlyHours={Number(tenant.monthly_hours)} />}

      {profile.role === "admin" ? (
        <Card>
          <CardHeader>
            <CardTitle>Configuração da empresa</CardTitle>
            <CardDescription>Dados, domínio corporativo e parâmetros de cálculo.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button nativeButton={false} render={<Link href="/configuracoes/empresa" />} variant="outline">
              Configurar empresa
              <ArrowRightIcon />
            </Button>
            <Button nativeButton={false} render={<Link href="/configuracoes/usuarios" />}>
              Convidar equipe
              <ArrowRightIcon />
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/** Resumo de rentabilidade do mês (até hoje) para quem gerencia a empresa. */
async function ManagerSummary() {
  const period = resolvePeriod(todayISO());
  const report = await getProfitabilityReport(period);
  const totals = report.totals;

  const byStatus = report.contracts.reduce<Record<HealthStatus, number>>(
    (acc, item) => {
      acc[item.profitability.status] += 1;
      return acc;
    },
    { saudavel: 0, atencao: 0, critico: 0 },
  );

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>Rentabilidade da empresa</CardTitle>
          <CardDescription>{period.label}</CardDescription>
        </div>
        <Button nativeButton={false} render={<Link href="/dashboard" />} variant="outline" size="sm">
          Ver rentabilidade completa
          <ArrowRightIcon />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Receita líquida" value={formatCurrency(totals.netRevenue)} />
          <Kpi label="Custo total" value={formatCurrency(totals.totalCost)} />
          <Kpi
            label="Lucro"
            value={formatCurrency(totals.profit)}
            hint={`Margem ${totals.realMargin === null ? "—" : formatPercent(totals.realMargin)} · meta ${formatPercent(totals.desiredMargin)}`}
          />
          <Kpi label="Horas apontadas" value={formatHours(totals.hours)} />
        </div>

        {report.contracts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            {(Object.keys(byStatus) as HealthStatus[]).map((status) =>
              byStatus[status] > 0 ? (
                <span key={status} className="flex items-center gap-1.5 text-sm">
                  <StatusBadge status={status} />
                  <span className="text-muted-foreground">
                    {byStatus[status]} {byStatus[status] === 1 ? "contrato" : "contratos"}
                  </span>
                </span>
              ) : null,
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum contrato com movimento no período.</p>
        )}
      </CardContent>
    </Card>
  );
}

function CollaboratorSummary({ monthlyHours }: { monthlyHours: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Jornada padrão</CardTitle>
        <CardDescription>Horas disponíveis no mês</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-3xl font-semibold">{formatHours(monthlyHours)}</p>
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href="/apontamentos" />}>
            Lançar horas
            <ArrowRightIcon />
          </Button>
          <Button nativeButton={false} render={<Link href="/minhas-analises" />} variant="outline">
            Minhas análises
            <ArrowRightIcon />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
