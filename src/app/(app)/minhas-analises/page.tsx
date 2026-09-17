import Link from "next/link";
import { CalendarX2Icon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ExportMenu } from "@/components/export-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatHours, formatPercent, todayISO } from "@/lib/format";
import { resolvePeriod } from "@/lib/periods";
import { analyzeMyHours, type MyHoursRow } from "@/lib/personal-analytics";
import { BarList } from "../dashboard/charts";
import { PeriodFilter } from "../dashboard/period-filter";
import { DailyHoursChart } from "./daily-hours-chart";

export const metadata = { title: "Minhas análises | Apontamento" };

function Kpi({
  label,
  value,
  expected,
  hint,
}: {
  label: string;
  value: number;
  expected?: number;
  hint?: string;
}) {
  const ratio = expected && expected > 0 ? Math.min(value / expected, 1) : null;
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{formatHours(value)}</CardTitle>
        {expected !== undefined ? (
          <>
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${(ratio ?? 0) * 100}%`, background: "var(--viz-1)" }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Esperado {formatHours(expected)}
              {expected > 0 ? ` · ${formatPercent(value / expected)}` : ""}
            </p>
          </>
        ) : null}
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardHeader>
    </Card>
  );
}

export default async function MyAnalyticsPage({ searchParams }: PageProps<"/minhas-analises">) {
  const params = await searchParams;
  const { tenant, employeeId, profile } = await requireContext();
  const today = todayISO();
  const period = resolvePeriod(today, {
    periodo: typeof params.periodo === "string" ? params.periodo : undefined,
    de: typeof params.de === "string" ? params.de : undefined,
    ate: typeof params.ate === "string" ? params.ate : undefined,
  });

  if (!employeeId) {
    return (
      <div className="grid gap-6">
        <PageHeader title="Minhas análises" />
        <Card>
          <CardHeader>
            <CardTitle>Sem cadastro de colaborador</CardTitle>
            <CardDescription>
              Seu login ainda não está vinculado a um colaborador, então não há horas para analisar.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("my_hours_breakdown", { p_from: period.from, p_to: period.to });
  const rows = (data ?? []) as MyHoursRow[];

  // Jornada diária = jornada mensal da empresa ÷ 21 dias úteis
  const dailyTarget = Number(tenant.monthly_hours) / 21;
  const a = analyzeMyHours(rows, { from: period.from, to: period.to, today }, dailyTarget);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Minhas análises"
        description={`${profile.full_name.split(" ")[0]}, aqui está o seu ${period.label.toLowerCase()}.`}
      >
        <ExportMenu dataset="apontamentos" label="Exportar minhas horas" scope="meus" />
      </PageHeader>

      <PeriodFilter preset={period.preset} from={period.from} to={period.to} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Hoje" value={a.hoursToday} expected={a.expectedToday} />
        <Kpi label="Esta semana" value={a.hoursThisWeek} expected={a.expectedThisWeek} />
        <Kpi
          label="No período"
          value={a.totalHours}
          expected={a.expectedHours}
          hint={`Saldo de ${a.balance >= 0 ? "+" : ""}${formatHours(a.balance)} até hoje`}
        />
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Horas faturáveis</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatPercent(a.billableShare)}</CardTitle>
            <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted">
              <div style={{ width: `${a.billableShare * 100}%`, background: "var(--viz-1)" }} />
              <div style={{ width: `${(1 - a.billableShare) * 100}%`, background: "var(--viz-2)" }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatHours(a.billableHours)} faturáveis · {formatHours(a.totalHours - a.billableHours)} não faturáveis
            </p>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Horas por dia</CardTitle>
          <CardDescription>A linha tracejada é a jornada diária esperada ({formatHours(dailyTarget)}).</CardDescription>
        </CardHeader>
        <CardContent>
          {a.byDay.length === 0 ? (
            <EmptyState>
              Nenhuma hora apontada no período.{" "}
              <Link href="/apontamentos" className="font-medium text-foreground underline">
                Lançar horas
              </Link>
              .
            </EmptyState>
          ) : (
            <DailyHoursChart data={a.byDay} dailyTarget={dailyTarget} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Por cliente</CardTitle>
            <CardDescription>Horas sem contrato aparecem como internas.</CardDescription>
          </CardHeader>
          <CardContent>
            {a.byClient.length === 0 ? (
              <EmptyState>Sem dados no período.</EmptyState>
            ) : (
              <BarList
                items={a.byClient.map((d) => ({
                  id: d.id,
                  label: d.label,
                  value: d.hours,
                  hint: formatPercent(d.share),
                }))}
                format="hours"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por atividade</CardTitle>
          </CardHeader>
          <CardContent>
            {a.byActivity.length === 0 ? (
              <EmptyState>Sem dados no período.</EmptyState>
            ) : (
              <BarList
                items={a.byActivity.map((d) => ({
                  id: d.id,
                  label: d.label,
                  value: d.hours,
                  hint: formatPercent(d.share),
                }))}
                format="hours"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por área</CardTitle>
          </CardHeader>
          <CardContent>
            {a.byArea.length === 0 ? (
              <EmptyState>Sem dados no período.</EmptyState>
            ) : (
              <BarList
                items={a.byArea.map((d) => ({
                  id: d.id,
                  label: d.label,
                  value: d.hours,
                  hint: formatPercent(d.share),
                }))}
                format="hours"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dias úteis sem apontamento</CardTitle>
          <CardDescription>
            {a.lastEntryDate
              ? `Último apontamento em ${formatDate(a.lastEntryDate)}.`
              : "Nenhum apontamento registrado no período."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {a.missingDays.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum dia útil em aberto no período. 🎉</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {a.missingDays.map((day) => (
                <Link
                  key={day}
                  href={`/apontamentos?semana=${day}`}
                  className="flex items-center gap-1 rounded-lg border px-2 py-1 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                  <CalendarX2Icon className="size-3" />
                  {formatDate(day)}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
