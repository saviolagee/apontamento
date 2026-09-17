import type { ContractPeriodicity, ContractStatus, ExpenseCategory, ExpenseRecurrence } from "@/lib/database.types";

export const PERIODICITY_LABELS: Record<ContractPeriodicity, string> = {
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  projeto: "Projeto fechado",
};

/** Meses de cada período; `null` para projeto fechado (valor único). */
export const PERIODICITY_MONTHS: Record<ContractPeriodicity, number | null> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
  projeto: null,
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  encerrado: "Encerrado",
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  deslocamento: "Deslocamento",
  software: "Software",
  terceirizado: "Terceirizado",
  impostos: "Impostos",
  outros: "Outros",
};

export const EXPENSE_RECURRENCE_LABELS: Record<ExpenseRecurrence, string> = {
  pontual: "Pontual",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

/** Receita equivalente por mês (para comparar contratos de periodicidades diferentes). */
export function monthlyEquivalent(amount: number, periodicity: ContractPeriodicity, months?: number | null): number {
  const periodMonths = PERIODICITY_MONTHS[periodicity];
  if (periodMonths) return amount / periodMonths;
  // Projeto fechado: distribui pelo total de meses do projeto
  return months && months > 0 ? amount / months : amount;
}

/** Meses (aproximados) entre duas datas ISO, inclusivo. */
export function monthsBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  const days = (end.getTime() - start.getTime()) / 86_400_000 + 1;
  return days / 30.4375;
}
