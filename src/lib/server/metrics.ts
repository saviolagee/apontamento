import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { todayISO } from "@/lib/format";
import {
  computeProfitability,
  projectClosing,
  suggestedAdjustment,
  sumProfitability,
  type ContractMetricsRow,
} from "@/lib/profitability";
import type { Period } from "@/lib/periods";
import type { ContractReport, MonthPoint } from "./metrics.types";

export type { ContractReport } from "./metrics.types";

export type ProfitabilityReport = {
  period: Period;
  contracts: ContractReport[];
  totals: ReturnType<typeof sumProfitability>;
  tolerance: number;
};

/** Relatório de rentabilidade do período (admin/gestor). */
export async function getProfitabilityReport(period: Period): Promise<ProfitabilityReport> {
  const { tenant } = await requireRole(["admin", "gestor"]);
  const supabase = await createClient();

  const { data } = await supabase.rpc("contract_metrics", { p_from: period.from, p_to: period.to });
  const rows = (data ?? []) as ContractMetricsRow[];
  const tolerance = Number(tenant.margin_attention_tolerance) || 0;
  const options = { attentionTolerancePoints: tolerance };
  const today = todayISO();

  const contracts: ContractReport[] = rows.map((row) => {
    const profitability = computeProfitability(row, options);
    return {
      row,
      profitability,
      projection: projectClosing(row, profitability, { ...period, today }, options),
      adjustment: suggestedAdjustment(row, profitability),
    };
  });

  contracts.sort((a, b) => b.profitability.profit - a.profitability.profit);

  return {
    period,
    contracts,
    totals: sumProfitability(contracts.map((c) => c.profitability)),
    tolerance,
  };
}

/** Utilização e horas faturáveis por colaborador no período. */
export async function getEmployeeMetrics(period: Period) {
  await requireRole(["admin", "gestor"]);
  const supabase = await createClient();
  const { data } = await supabase.rpc("employee_metrics", { p_from: period.from, p_to: period.to });
  return (data ?? []).filter((e) => e.active);
}

/** Rentabilidade por área: receita do contrato rateada pelas horas de cada área. */
export async function getAreaReport(period: Period, contracts: ContractReport[]) {
  await requireRole(["admin", "gestor"]);
  const supabase = await createClient();
  const { data } = await supabase.rpc("contract_area_hours", { p_from: period.from, p_to: period.to });
  const rows = data ?? [];

  const hoursByContract = new Map<string, number>();
  for (const row of rows) {
    hoursByContract.set(row.contract_id, (hoursByContract.get(row.contract_id) ?? 0) + Number(row.hours));
  }

  const areas = new Map<string, { name: string; hours: number; laborCost: number; revenue: number }>();
  for (const row of rows) {
    const key = row.area_id ?? "sem-area";
    const entry = areas.get(key) ?? { name: row.area_name, hours: 0, laborCost: 0, revenue: 0 };
    entry.hours += Number(row.hours);
    entry.laborCost += Number(row.labor_cost);

    const contract = contracts.find((c) => c.row.contract_id === row.contract_id);
    const contractHours = hoursByContract.get(row.contract_id) ?? 0;
    if (contract && contractHours > 0) {
      // Rateio proporcional às horas da área dentro do contrato
      entry.revenue += contract.profitability.netRevenue * (Number(row.hours) / contractHours);
    }
    areas.set(key, entry);
  }

  return [...areas.entries()]
    .map(([id, area]) => ({
      id,
      name: area.name,
      hours: area.hours,
      laborCost: area.laborCost,
      revenue: area.revenue,
      profit: area.revenue - area.laborCost,
      margin: area.revenue > 0 ? (area.revenue - area.laborCost) / area.revenue : null,
    }))
    .sort((a, b) => b.profit - a.profit);
}

export async function getActivityMetrics(period: Period) {
  await requireRole(["admin", "gestor"]);
  const supabase = await createClient();
  const { data } = await supabase.rpc("activity_metrics", { p_from: period.from, p_to: period.to });
  return (data ?? []).sort((a, b) => Number(b.labor_cost) - Number(a.labor_cost));
}

export async function getEmployeeClientCost(period: Period) {
  await requireRole(["admin", "gestor"]);
  const supabase = await createClient();
  const { data } = await supabase.rpc("employee_client_cost", { p_from: period.from, p_to: period.to });
  return (data ?? []).sort((a, b) => Number(b.labor_cost) - Number(a.labor_cost));
}

export async function getMissingCosts() {
  await requireRole(["admin", "gestor"]);
  const supabase = await createClient();
  const { data } = await supabase.rpc("employees_missing_cost");
  return data ?? [];
}

export async function getPendingApprovalsCount() {
  await requireRole(["admin", "gestor"]);
  const supabase = await createClient();
  const { count } = await supabase
    .from("time_entries")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");
  return count ?? 0;
}

export type { MonthPoint } from "./metrics.types";

/** Evolução mês a mês da empresa (ou de um contrato específico). */
export async function getMonthlyEvolution(
  months: { from: string; to: string; label: string }[],
  contractId?: string,
): Promise<MonthPoint[]> {
  const { tenant } = await requireRole(["admin", "gestor"]);
  const supabase = await createClient();
  const options = { attentionTolerancePoints: Number(tenant.margin_attention_tolerance) || 0 };

  const results = await Promise.all(
    months.map(async (month) => {
      const { data } = await supabase.rpc("contract_metrics", { p_from: month.from, p_to: month.to });
      const rows = ((data ?? []) as ContractMetricsRow[]).filter(
        (row) => !contractId || row.contract_id === contractId,
      );
      const totals = sumProfitability(rows.map((row) => computeProfitability(row, options)));
      return {
        label: month.label,
        revenue: totals.netRevenue,
        cost: totals.totalCost,
        profit: totals.profit,
        margin: totals.realMargin,
        desiredMargin: rows.length ? totals.desiredMargin : null,
        hours: totals.hours,
      };
    }),
  );

  return results;
}
