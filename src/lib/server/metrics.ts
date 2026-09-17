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
  type Profitability,
  type Projection,
} from "@/lib/profitability";
import type { Period } from "@/lib/periods";

export type ContractReport = {
  row: ContractMetricsRow;
  profitability: Profitability;
  projection: Projection | null;
  /** Reajuste necessário para atingir a margem desejada (fração). */
  adjustment: number | null;
};

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
