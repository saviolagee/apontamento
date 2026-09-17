import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ExportMenu } from "@/components/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { resolvePeriod } from "@/lib/periods";
import { PeriodFilter } from "../../dashboard/period-filter";
import { ContractProfitability } from "./contract-profitability";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatHours, todayISO } from "@/lib/format";
import { CONTRACT_STATUS_LABELS, PERIODICITY_LABELS, PERIODICITY_MONTHS, monthsBetween } from "@/lib/contracts";
import type { Tables } from "@/lib/database.types";
import { ContractForm } from "../contract-form";
import { ContractLinksForm, ExpensesCard } from "./contract-detail";

export const metadata = { title: "Contrato | Apontamento" };

export default async function ContractPage({ params, searchParams }: PageProps<"/contratos/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const period = resolvePeriod(todayISO(), {
    periodo: typeof query.periodo === "string" ? query.periodo : undefined,
    de: typeof query.de === "string" ? query.de : undefined,
    ate: typeof query.ate === "string" ? query.ate : undefined,
  });
  await requireRole(["admin", "gestor"]);
  const supabase = await createClient();

  const { data: contract } = await supabase
    .from("contracts")
    .select("*, clients(id, legal_name, trade_name)")
    .eq("id", id)
    .maybeSingle<Tables<"contracts"> & { clients: Pick<Tables<"clients">, "id" | "legal_name" | "trade_name"> }>();

  if (!contract) notFound();

  const [
    { data: areas },
    { data: activities },
    { data: employees },
    { data: linkedAreas },
    { data: linkedActivities },
    { data: members },
    { data: expenses },
  ] = await Promise.all([
    supabase.from("areas").select("id, name, active").order("name"),
    supabase.from("activities").select("id, name, active, area_id").order("name"),
    supabase.from("employees").select("id, full_name, active").order("full_name"),
    supabase.from("contract_areas").select("area_id").eq("contract_id", id),
    supabase.from("contract_activities").select("activity_id").eq("contract_id", id),
    supabase.from("contract_members").select("employee_id").eq("contract_id", id),
    supabase.from("contract_expenses").select("*").eq("contract_id", id).order("expense_date", { ascending: false }),
  ]);

  const periodMonths = PERIODICITY_MONTHS[contract.periodicity];
  const projectMonths =
    contract.periodicity === "projeto" && contract.end_date
      ? monthsBetween(contract.start_date, contract.end_date)
      : null;
  const monthlyRevenue = periodMonths
    ? Number(contract.amount) / periodMonths
    : projectMonths
      ? Number(contract.amount) / projectMonths
      : null;
  const netMonthly = monthlyRevenue !== null ? monthlyRevenue * (1 - Number(contract.tax_rate) / 100) : null;

  return (
    <div className="grid gap-6">
      <Link
        href={`/clientes/${contract.clients.id}`}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        {contract.clients.trade_name || contract.clients.legal_name}
      </Link>

      <PageHeader title={contract.name} description={contract.description ?? undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <ExportMenu dataset="gastos" label="Gastos" />
          <ExportMenu dataset="rentabilidade" label="Rentabilidade" />
          <Badge variant="secondary">{PERIODICITY_LABELS[contract.periodicity]}</Badge>
          <Badge variant={contract.status === "ativo" ? "default" : "secondary"}>
            {CONTRACT_STATUS_LABELS[contract.status]}
          </Badge>
        </div>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>
              {contract.periodicity === "projeto" ? "Valor do projeto" : "Valor por período"}
            </CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(Number(contract.amount))}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Receita equivalente / mês</CardDescription>
            <CardTitle className="text-2xl">{monthlyRevenue !== null ? formatCurrency(monthlyRevenue) : "—"}</CardTitle>
            {netMonthly !== null && Number(contract.tax_rate) > 0 ? (
              <p className="text-xs text-muted-foreground">
                Líquida de impostos: {formatCurrency(netMonthly)} ({Number(contract.tax_rate).toLocaleString("pt-BR")}%)
              </p>
            ) : null}
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Margem desejada</CardDescription>
            <CardTitle className="text-2xl">
              {Number(contract.desired_margin).toLocaleString("pt-BR")}%
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Vigência</CardDescription>
            <CardTitle className="text-lg">
              {formatDate(contract.start_date)} — {contract.end_date ? formatDate(contract.end_date) : "sem término"}
            </CardTitle>
            {contract.expected_hours ? (
              <p className="text-xs text-muted-foreground">
                {formatHours(Number(contract.expected_hours))} previstas por período
              </p>
            ) : null}
          </CardHeader>
        </Card>
      </div>

      <PeriodFilter preset={period.preset} from={period.from} to={period.to} />

      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <ContractProfitability contractId={contract.id} period={period} />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Dados do contrato</CardTitle>
        </CardHeader>
        <CardContent>
          <ContractForm clientId={contract.clients.id} contract={contract} today={todayISO()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Escopo e equipe</CardTitle>
          <CardDescription>
            Áreas, atividades e colaboradores alocados — usados nos filtros e no limite de horas da meta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContractLinksForm
            contractId={contract.id}
            areas={(areas ?? []) as Pick<Tables<"areas">, "id" | "name" | "active">[]}
            activities={(activities ?? []) as Pick<Tables<"activities">, "id" | "name" | "active" | "area_id">[]}
            employees={(employees ?? []) as Pick<Tables<"employees">, "id" | "full_name" | "active">[]}
            selectedAreas={(linkedAreas ?? []).map((a) => a.area_id)}
            selectedActivities={(linkedActivities ?? []).map((a) => a.activity_id)}
            selectedEmployees={(members ?? []).map((m) => m.employee_id)}
          />
        </CardContent>
      </Card>

      <ExpensesCard
        contractId={contract.id}
        expenses={(expenses ?? []) as Tables<"contract_expenses">[]}
        today={todayISO()}
      />
    </div>
  );
}
