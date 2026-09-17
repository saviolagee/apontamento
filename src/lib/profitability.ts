import type { ContractPeriodicity, ContractStatus } from "@/lib/database.types";

/** Linha crua vinda de `public.contract_metrics`. */
export type ContractMetricsRow = {
  contract_id: string;
  contract_name: string;
  client_id: string;
  client_name: string;
  periodicity: ContractPeriodicity;
  contract_status: ContractStatus;
  amount: number;
  /** Margem desejada em % (ex.: 30). */
  desired_margin: number;
  /** Alíquota de impostos sobre a receita em % (ex.: 6). */
  tax_rate: number;
  expected_hours: number | null;
  start_date: string;
  end_date: string | null;
  revenue: number;
  hours: number;
  billable_hours: number;
  labor_cost: number;
  expense_cost: number;
  team_cost_per_hour: number | null;
  entries_count: number;
};

export type HealthStatus = "saudavel" | "atencao" | "critico";

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  critico: "Crítico",
};

export type Profitability = {
  revenue: number;
  taxAmount: number;
  netRevenue: number;
  laborCost: number;
  expenseCost: number;
  totalCost: number;
  profit: number;
  /** Margem real como fração (0,25 = 25%). Null quando não há receita. */
  realMargin: number | null;
  /** Margem desejada como fração. */
  desiredMargin: number;
  /** Desvio da meta em pontos percentuais (negativo = abaixo da meta). */
  marginGapPoints: number | null;
  hours: number;
  billableHours: number;
  /** Receita líquida ÷ horas apontadas. */
  effectiveHourlyRate: number | null;
  /** Horas que cabem no orçamento para bater a margem desejada. */
  hoursLimit: number | null;
  /** Horas apontadas ÷ limite de horas (1 = limite atingido). */
  hoursConsumption: number | null;
  status: HealthStatus;
};

const toFraction = (percent: number) => percent / 100;

/**
 * Indicadores de rentabilidade do período.
 *
 * - Receita líquida = receita − impostos
 * - Custo total = custo das horas + gastos extras
 * - Margem real = lucro ÷ receita líquida
 * - Limite de horas = (receita líquida × (1 − margem desejada) − custo extra)
 *                     ÷ custo hora médio da equipe
 */
export function computeProfitability(
  row: ContractMetricsRow,
  options: { attentionTolerancePoints: number },
): Profitability {
  const revenue = Number(row.revenue) || 0;
  const taxRate = toFraction(Number(row.tax_rate) || 0);
  const desiredMargin = toFraction(Number(row.desired_margin) || 0);
  const laborCost = Number(row.labor_cost) || 0;
  const expenseCost = Number(row.expense_cost) || 0;
  const hours = Number(row.hours) || 0;
  const billableHours = Number(row.billable_hours) || 0;

  const taxAmount = revenue * taxRate;
  const netRevenue = revenue - taxAmount;
  const totalCost = laborCost + expenseCost;
  const profit = netRevenue - totalCost;

  const realMargin = netRevenue > 0 ? profit / netRevenue : null;
  const marginGapPoints = realMargin === null ? null : (realMargin - desiredMargin) * 100;
  const effectiveHourlyRate = hours > 0 ? netRevenue / hours : null;

  const teamCost = Number(row.team_cost_per_hour) || 0;
  const costBudget = netRevenue * (1 - desiredMargin) - expenseCost;
  const hoursLimit = teamCost > 0 && costBudget > 0 ? costBudget / teamCost : null;
  const hoursConsumption = hoursLimit && hoursLimit > 0 ? hours / hoursLimit : null;

  return {
    revenue,
    taxAmount,
    netRevenue,
    laborCost,
    expenseCost,
    totalCost,
    profit,
    realMargin,
    desiredMargin,
    marginGapPoints,
    hours,
    billableHours,
    effectiveHourlyRate,
    hoursLimit,
    hoursConsumption,
    status: healthStatus(realMargin, desiredMargin, profit, options.attentionTolerancePoints),
  };
}

/**
 * 🟢 margem real ≥ desejada · 🟡 abaixo da meta dentro da tolerância ·
 * 🔴 abaixo da tolerância ou prejuízo.
 */
export function healthStatus(
  realMargin: number | null,
  desiredMargin: number,
  profit: number,
  attentionTolerancePoints: number,
): HealthStatus {
  if (profit < 0) return "critico";
  if (realMargin === null) return profit > 0 ? "saudavel" : "atencao";
  if (realMargin >= desiredMargin) return "saudavel";
  const gapPoints = (desiredMargin - realMargin) * 100;
  return gapPoints <= attentionTolerancePoints ? "atencao" : "critico";
}

export type Projection = {
  /** Fração do período já decorrida (0 a 1). */
  elapsed: number;
  projectedHours: number;
  projectedLaborCost: number;
  projectedTotalCost: number;
  projectedProfit: number;
  projectedMargin: number | null;
  projectedStatus: HealthStatus;
};

/**
 * Projeção de fechamento: mantém o ritmo atual de horas até o fim do período.
 * Receita e gastos extras do período já são valores fechados.
 */
export function projectClosing(
  row: ContractMetricsRow,
  profitability: Profitability,
  period: { from: string; to: string; today: string },
  options: { attentionTolerancePoints: number },
): Projection | null {
  const total = daysBetween(period.from, period.to);
  if (total <= 0) return null;

  const elapsedDays = Math.min(Math.max(daysBetween(period.from, period.today), 0), total);
  if (elapsedDays <= 0) return null;
  const elapsed = elapsedDays / total;

  const factor = 1 / elapsed;
  const projectedHours = profitability.hours * factor;
  const projectedLaborCost = profitability.laborCost * factor;
  const projectedTotalCost = projectedLaborCost + profitability.expenseCost;
  const projectedProfit = profitability.netRevenue - projectedTotalCost;
  const projectedMargin = profitability.netRevenue > 0 ? projectedProfit / profitability.netRevenue : null;

  return {
    elapsed,
    projectedHours,
    projectedLaborCost,
    projectedTotalCost,
    projectedProfit,
    projectedMargin,
    projectedStatus: healthStatus(
      projectedMargin,
      profitability.desiredMargin,
      projectedProfit,
      options.attentionTolerancePoints,
    ),
  };
}

/**
 * Valor de contrato (no período consultado) necessário para atingir a margem
 * desejada com o consumo real de horas. Null quando não há custo apurado.
 */
export function suggestedRevenue(row: ContractMetricsRow, profitability: Profitability): number | null {
  const totalCost = profitability.totalCost;
  if (totalCost <= 0) return null;
  const desiredMargin = profitability.desiredMargin;
  if (desiredMargin >= 1) return null;

  const neededNet = totalCost / (1 - desiredMargin);
  const taxRate = toFraction(Number(row.tax_rate) || 0);
  return taxRate >= 1 ? null : neededNet / (1 - taxRate);
}

/** Reajuste sugerido sobre o valor atual do contrato (fração; 0,15 = +15%). */
export function suggestedAdjustment(row: ContractMetricsRow, profitability: Profitability): number | null {
  const needed = suggestedRevenue(row, profitability);
  if (needed === null || profitability.revenue <= 0) return null;
  return needed / profitability.revenue - 1;
}

/** Dias entre duas datas ISO, inclusivo. */
export function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00Z`);
  const to = Date.parse(`${toISO}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.floor((to - from) / 86_400_000) + 1;
}

/** Soma os agregados de vários contratos (visão da empresa). */
export function sumProfitability(items: Profitability[]): Omit<Profitability, "status" | "desiredMargin"> & {
  desiredMargin: number;
  status: HealthStatus;
} {
  const sum = (pick: (p: Profitability) => number) => items.reduce((acc, p) => acc + pick(p), 0);

  const revenue = sum((p) => p.revenue);
  const netRevenue = sum((p) => p.netRevenue);
  const laborCost = sum((p) => p.laborCost);
  const expenseCost = sum((p) => p.expenseCost);
  const totalCost = laborCost + expenseCost;
  const profit = netRevenue - totalCost;
  const hours = sum((p) => p.hours);
  const billableHours = sum((p) => p.billableHours);
  const realMargin = netRevenue > 0 ? profit / netRevenue : null;

  // Meta da empresa = média das metas ponderada pela receita líquida
  const desiredMargin =
    netRevenue > 0 ? sum((p) => p.desiredMargin * p.netRevenue) / netRevenue : items[0]?.desiredMargin ?? 0;

  return {
    revenue,
    taxAmount: sum((p) => p.taxAmount),
    netRevenue,
    laborCost,
    expenseCost,
    totalCost,
    profit,
    realMargin,
    desiredMargin,
    marginGapPoints: realMargin === null ? null : (realMargin - desiredMargin) * 100,
    hours,
    billableHours,
    effectiveHourlyRate: hours > 0 ? netRevenue / hours : null,
    hoursLimit: null,
    hoursConsumption: null,
    status: healthStatus(realMargin, desiredMargin, profit, 10),
  };
}
