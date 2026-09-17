import type { ContractReport } from "@/lib/server/metrics.types";
import { businessDaysBetween } from "@/lib/time";

export type AlertLevel = "critico" | "atencao" | "info";

export type Alert = {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  href?: string;
};

export type EmployeeMetric = {
  employee_id: string;
  employee_name: string;
  hours: number;
  last_entry_date: string | null;
};

export type AlertInput = {
  contracts: ContractReport[];
  employees: EmployeeMetric[];
  missingCosts: { employee_id: string; employee_name: string; hours_last_90_days: number }[];
  pendingCount: number;
  today: string;
  /** Dias úteis sem apontamento que disparam alerta. */
  idleBusinessDays?: number;
};

const pct = (value: number) => `${Math.round(value * 100)}%`;

/** Alertas do período, do mais grave para o menos grave. */
export function buildAlerts({
  contracts,
  employees,
  missingCosts,
  pendingCount,
  today,
  idleBusinessDays = 3,
}: AlertInput): Alert[] {
  const alerts: Alert[] = [];

  // Colaborador sem custo cadastrado distorce toda a rentabilidade:
  // as horas dele entram como custo zero.
  if (missingCosts.length > 0) {
    const withHours = missingCosts.filter((e) => Number(e.hours_last_90_days) > 0);
    alerts.push({
      id: "sem-custo",
      level: withHours.length > 0 ? "critico" : "atencao",
      title: `${missingCosts.length} colaborador(es) sem custo cadastrado`,
      detail:
        withHours.length > 0
          ? `${withHours.map((e) => e.employee_name).join(", ")} apontaram horas sem custo hora definido — essas horas entram como custo zero e inflam a margem. Cadastre salário, encargos e benefícios.`
          : `Cadastre o custo de ${missingCosts.map((e) => e.employee_name).join(", ")} para que as horas virem custo real.`,
      href: "/colaboradores",
    });
  }

  for (const { row, profitability, projection } of contracts) {
    const href = `/contratos/${row.contract_id}`;
    const name = `${row.client_name} · ${row.contract_name}`;

    if (profitability.status === "critico") {
      alerts.push({
        id: `critico-${row.contract_id}`,
        level: "critico",
        title: `${name} está crítico`,
        detail:
          profitability.profit < 0
            ? `Prejuízo de ${Math.abs(profitability.profit).toFixed(2)} no período.`
            : `Margem real de ${pct(profitability.realMargin ?? 0)} contra meta de ${pct(profitability.desiredMargin)}.`,
        href,
      });
    } else if (profitability.status === "atencao") {
      alerts.push({
        id: `atencao-${row.contract_id}`,
        level: "atencao",
        title: `${name} abaixo da meta`,
        detail: `Margem real de ${pct(profitability.realMargin ?? 0)} contra meta de ${pct(profitability.desiredMargin)}.`,
        href,
      });
    }

    const consumption = profitability.hoursConsumption;
    if (consumption !== null && consumption >= 1) {
      alerts.push({
        id: `limite-100-${row.contract_id}`,
        level: "critico",
        title: `${name} estourou o limite de horas`,
        detail: `${profitability.hours.toFixed(1)}h apontadas para um limite de ${profitability.hoursLimit?.toFixed(1)}h (${pct(consumption)}).`,
        href,
      });
    } else if (consumption !== null && consumption >= 0.8) {
      alerts.push({
        id: `limite-80-${row.contract_id}`,
        level: "atencao",
        title: `${name} chegou a ${pct(consumption)} do limite de horas`,
        detail: `${profitability.hours.toFixed(1)}h de ${profitability.hoursLimit?.toFixed(1)}h previstas para bater a meta.`,
        href,
      });
    }

    // Risco pela projeção: hoje está ok, mas o ritmo atual derruba a margem
    if (
      projection &&
      profitability.status !== "critico" &&
      projection.projectedStatus === "critico" &&
      projection.elapsed < 1
    ) {
      alerts.push({
        id: `projecao-${row.contract_id}`,
        level: "atencao",
        title: `${name} pode fechar o período fora da meta`,
        detail: `No ritmo atual, a margem fecha em ${pct(projection.projectedMargin ?? 0)} (meta de ${pct(profitability.desiredMargin)}).`,
        href,
      });
    }
  }

  for (const employee of employees) {
    if (!employee.last_entry_date) continue;
    const idle = businessDaysBetween(employee.last_entry_date, today) - 1;
    if (idle >= idleBusinessDays) {
      alerts.push({
        id: `sem-apontar-${employee.employee_id}`,
        level: "info",
        title: `${employee.employee_name} está há ${idle} dias úteis sem apontar`,
        detail: `Último apontamento em ${employee.last_entry_date.split("-").reverse().join("/")}.`,
        href: "/aprovacoes",
      });
    }
  }

  if (pendingCount > 0) {
    alerts.push({
      id: "pendentes",
      level: "info",
      title: `${pendingCount} apontamento(s) aguardando aprovação`,
      detail: "Revise para que as horas entrem na apuração com segurança.",
      href: "/aprovacoes",
    });
  }

  const order: Record<AlertLevel, number> = { critico: 0, atencao: 1, info: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}
