import type { ContractMetricsRow, Profitability, Projection } from "@/lib/profitability";

export type MonthPoint = {
  label: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number | null;
  desiredMargin: number | null;
  hours: number;
};

export type ContractReport = {
  row: ContractMetricsRow;
  profitability: Profitability;
  projection: Projection | null;
  /** Reajuste necessário para atingir a margem desejada (fração). */
  adjustment: number | null;
};
