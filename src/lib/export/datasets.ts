import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext, requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { CONTRACT_STATUS_LABELS, EXPENSE_CATEGORY_LABELS, EXPENSE_RECURRENCE_LABELS, PERIODICITY_LABELS } from "@/lib/contracts";
import { HEALTH_LABELS } from "@/lib/profitability";
import { getEmployeeMetrics, getProfitabilityReport, type ContractReport } from "@/lib/server/metrics";
import type { Period } from "@/lib/periods";
import type { Tables } from "@/lib/database.types";
import type { Dataset } from "./dataset";

export const EXPORT_DATASETS = ["rentabilidade", "apontamentos", "equipe", "gastos"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

export const DATASET_LABELS: Record<ExportDataset, string> = {
  rentabilidade: "Rentabilidade por contrato",
  apontamentos: "Apontamentos",
  equipe: "Utilização da equipe",
  gastos: "Gastos extras",
};

type ClientRef = { legal_name: string; trade_name: string | null } | null;

type ExpenseExportRow = Tables<"contract_expenses"> & {
  contracts: { name: string; clients: ClientRef } | null;
};

type TimeEntryRow = {
  entry_date: string;
  minutes: number;
  billable: boolean;
  status: string;
  description: string | null;
  cost_amount: number;
  employees: { full_name: string } | null;
  activities: { name: string } | null;
  contracts: { name: string; clients: { legal_name: string; trade_name: string | null } | null } | null;
};

function rentabilidade(contracts: ContractReport[], period: Period): Dataset<ContractReport> {
  return {
    filename: `rentabilidade-${period.from}-a-${period.to}`,
    title: "Rentabilidade por contrato",
    subtitle: `${period.label} (${formatDate(period.from)} a ${formatDate(period.to)})`,
    rows: contracts,
    columns: [
      { header: "Cliente", type: "text", value: (c) => c.row.client_name },
      { header: "Contrato", type: "text", value: (c) => c.row.contract_name },
      { header: "Periodicidade", type: "text", value: (c) => PERIODICITY_LABELS[c.row.periodicity] },
      { header: "Situação", type: "text", value: (c) => CONTRACT_STATUS_LABELS[c.row.contract_status] },
      { header: "Receita bruta", type: "currency", value: (c) => c.profitability.revenue },
      { header: "Impostos", type: "currency", value: (c) => c.profitability.taxAmount },
      { header: "Receita líquida", type: "currency", value: (c) => c.profitability.netRevenue },
      { header: "Custo das horas", type: "currency", value: (c) => c.profitability.laborCost },
      { header: "Gastos extras", type: "currency", value: (c) => c.profitability.expenseCost },
      { header: "Custo total", type: "currency", value: (c) => c.profitability.totalCost },
      { header: "Lucro", type: "currency", value: (c) => c.profitability.profit },
      { header: "Margem real", type: "percent", value: (c) => c.profitability.realMargin },
      { header: "Margem desejada", type: "percent", value: (c) => c.profitability.desiredMargin },
      {
        header: "Desvio (p.p.)",
        type: "number",
        value: (c) => c.profitability.marginGapPoints,
      },
      { header: "Horas", type: "hours", value: (c) => c.profitability.hours },
      { header: "Horas faturáveis", type: "hours", value: (c) => c.profitability.billableHours },
      { header: "Limite de horas", type: "hours", value: (c) => c.profitability.hoursLimit },
      { header: "Consumo do limite", type: "percent", value: (c) => c.profitability.hoursConsumption },
      { header: "Valor hora efetivo", type: "currency", value: (c) => c.profitability.effectiveHourlyRate },
      { header: "Status", type: "text", value: (c) => HEALTH_LABELS[c.profitability.status] },
      {
        header: "Reajuste sugerido",
        type: "percent",
        value: (c) => (c.adjustment !== null && c.adjustment > 0 ? c.adjustment : null),
      },
    ],
  };
}

/** Monta o dataset pedido, respeitando o período e o perfil de quem exporta. */
export async function buildDataset(
  dataset: ExportDataset,
  period: Period,
  options: { scope?: "meus" | "todos" } = {},
): Promise<Dataset<never>> {
  const supabase = await createClient();

  if (dataset === "rentabilidade") {
    const report = await getProfitabilityReport(period);
    return rentabilidade(report.contracts, period) as unknown as Dataset<never>;
  }

  if (dataset === "equipe") {
    await requireRole(["admin", "gestor"]);
    const employees = await getEmployeeMetrics(period);
    type EmployeeRow = (typeof employees)[number];
    const ds: Dataset<EmployeeRow> = {
      filename: `equipe-${period.from}-a-${period.to}`,
      title: "Utilização da equipe",
      subtitle: `${period.label} (${formatDate(period.from)} a ${formatDate(period.to)})`,
      rows: employees,
      columns: [
        { header: "Colaborador", type: "text", value: (e) => e.employee_name },
        { header: "Horas disponíveis", type: "hours", value: (e) => Number(e.available_hours) },
        { header: "Horas apontadas", type: "hours", value: (e) => Number(e.hours) },
        {
          header: "Utilização",
          type: "percent",
          value: (e) => (Number(e.available_hours) > 0 ? Number(e.hours) / Number(e.available_hours) : null),
        },
        { header: "Horas faturáveis", type: "hours", value: (e) => Number(e.billable_hours) },
        {
          header: "Taxa faturável",
          type: "percent",
          value: (e) => (Number(e.hours) > 0 ? Number(e.billable_hours) / Number(e.hours) : null),
        },
        { header: "Custo das horas", type: "currency", value: (e) => Number(e.labor_cost) },
        { header: "Lançamentos", type: "number", value: (e) => Number(e.entries_count) },
        {
          header: "Último apontamento",
          type: "date",
          value: (e) => (e.last_entry_date ? formatDate(e.last_entry_date) : ""),
        },
      ],
    };
    return ds as unknown as Dataset<never>;
  }

  if (dataset === "gastos") {
    await requireRole(["admin", "gestor"]);
    const { data } = await supabase
      .from("contract_expenses")
      .select("*, contracts(name, clients(legal_name, trade_name))")
      .lte("expense_date", period.to)
      .order("expense_date", { ascending: false });

    const rows = (data ?? []) as unknown as ExpenseExportRow[];

    const ds: Dataset<ExpenseExportRow> = {
      filename: `gastos-extras-${period.from}-a-${period.to}`,
      title: "Gastos extras",
      subtitle: `${period.label} (${formatDate(period.from)} a ${formatDate(period.to)})`,
      rows,
      columns: [
        {
          header: "Cliente",
          type: "text",
          value: (e) => e.contracts?.clients?.trade_name || e.contracts?.clients?.legal_name || "",
        },
        { header: "Contrato", type: "text", value: (e) => e.contracts?.name ?? "" },
        { header: "Descrição", type: "text", value: (e) => e.description },
        { header: "Categoria", type: "text", value: (e) => EXPENSE_CATEGORY_LABELS[e.category] },
        { header: "Tipo", type: "text", value: (e) => EXPENSE_RECURRENCE_LABELS[e.recurrence] },
        { header: "Valor", type: "currency", value: (e) => Number(e.amount) },
        { header: "Data / início", type: "date", value: (e) => formatDate(e.expense_date) },
        { header: "Fim", type: "date", value: (e) => (e.end_date ? formatDate(e.end_date) : "") },
      ],
    };
    return ds as unknown as Dataset<never>;
  }

  // apontamentos
  const { profile, employeeId } = await requireContext();
  const scope = options.scope ?? (profile.role === "colaborador" ? "meus" : "todos");

  let query = supabase
    .from("time_entries")
    .select(
      "entry_date, minutes, billable, status, description, cost_amount, employees(full_name), activities(name), contracts(name, clients(legal_name, trade_name))",
    )
    .gte("entry_date", period.from)
    .lte("entry_date", period.to)
    .order("entry_date", { ascending: false });

  if (scope === "meus" && employeeId) query = query.eq("employee_id", employeeId);

  const { data } = await query;
  const rows = (data ?? []) as unknown as TimeEntryRow[];
  const canSeeCost = profile.role === "admin" || profile.can_view_costs;

  const ds: Dataset<TimeEntryRow> = {
    filename: `apontamentos-${period.from}-a-${period.to}`,
    title: scope === "meus" ? "Meus apontamentos" : "Apontamentos",
    subtitle: `${period.label} (${formatDate(period.from)} a ${formatDate(period.to)})`,
    rows,
    columns: [
      { header: "Data", type: "date", value: (e) => formatDate(e.entry_date) },
      { header: "Colaborador", type: "text", value: (e) => e.employees?.full_name ?? "" },
      {
        header: "Cliente",
        type: "text",
        value: (e) => e.contracts?.clients?.trade_name || e.contracts?.clients?.legal_name || "Interno",
      },
      { header: "Contrato", type: "text", value: (e) => e.contracts?.name ?? "" },
      { header: "Atividade", type: "text", value: (e) => e.activities?.name ?? "" },
      { header: "Faturável", type: "text", value: (e) => (e.billable ? "Sim" : "Não") },
      { header: "Horas", type: "hours", value: (e) => e.minutes / 60 },
      { header: "Descrição", type: "text", value: (e) => e.description ?? "" },
      { header: "Situação", type: "text", value: (e) => e.status },
      ...(canSeeCost
        ? [{ header: "Custo", type: "currency" as const, value: (e: TimeEntryRow) => Number(e.cost_amount) }]
        : []),
    ],
  };
  return ds as unknown as Dataset<never>;
}
