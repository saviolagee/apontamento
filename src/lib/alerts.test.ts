import { describe, expect, it } from "vitest";
import { buildAlerts, type AlertInput } from "./alerts";
import { computeProfitability, projectClosing, type ContractMetricsRow } from "./profitability";

const row: ContractMetricsRow = {
  contract_id: "c1",
  contract_name: "Mensal",
  client_id: "cl1",
  client_name: "Cliente Um",
  periodicity: "mensal",
  contract_status: "ativo",
  amount: 10000,
  desired_margin: 30,
  tax_rate: 0,
  expected_hours: null,
  start_date: "2026-01-01",
  end_date: null,
  revenue: 10000,
  hours: 50,
  billable_hours: 50,
  labor_cost: 5000,
  expense_cost: 1000,
  team_cost_per_hour: 100,
  entries_count: 10,
};

const opts = { attentionTolerancePoints: 10 };

function report(overrides: Partial<ContractMetricsRow> = {}, period?: { from: string; to: string; today: string }) {
  const merged = { ...row, ...overrides };
  const profitability = computeProfitability(merged, opts);
  return {
    row: merged,
    profitability,
    projection: period ? projectClosing(merged, profitability, period, opts) : null,
    adjustment: null,
  };
}

const base: AlertInput = {
  contracts: [],
  employees: [],
  missingCosts: [],
  pendingCount: 0,
  today: "2026-03-17",
};

describe("alertas", () => {
  it("avisa quando colaborador que apontou horas está sem custo cadastrado", () => {
    const alerts = buildAlerts({
      ...base,
      missingCosts: [{ employee_id: "e1", employee_name: "Carla", hours_last_90_days: 40 }],
    });
    expect(alerts[0].level).toBe("critico");
    expect(alerts[0].title).toContain("sem custo cadastrado");
    expect(alerts[0].detail).toContain("custo zero");
  });

  it("rebaixa o alerta quando quem está sem custo ainda não apontou nada", () => {
    const alerts = buildAlerts({
      ...base,
      missingCosts: [{ employee_id: "e1", employee_name: "Novo", hours_last_90_days: 0 }],
    });
    expect(alerts[0].level).toBe("atencao");
  });

  it("avisa em 80% e em 100% do limite de horas", () => {
    // Limite = (10.000 × 0,7 − 1.000) ÷ 100 = 60h
    const oitenta = buildAlerts({ ...base, contracts: [report({ hours: 50 })] });
    expect(oitenta.some((a) => a.id.startsWith("limite-80"))).toBe(true);

    const estourou = buildAlerts({ ...base, contracts: [report({ hours: 62, labor_cost: 6200 })] });
    expect(estourou.some((a) => a.id.startsWith("limite-100"))).toBe(true);
    expect(estourou.find((a) => a.id.startsWith("limite-100"))!.level).toBe("critico");
  });

  it("não alerta limite quando o consumo está baixo", () => {
    const alerts = buildAlerts({ ...base, contracts: [report({ hours: 20, labor_cost: 2000 })] });
    expect(alerts.some((a) => a.id.includes("limite"))).toBe(false);
  });

  it("alerta contrato amarelo e vermelho", () => {
    // 65h × R$ 100 + 1.000 de gastos = 25% de margem, 5 p.p. abaixo da meta
    const amarelo = buildAlerts({ ...base, contracts: [report({ hours: 65, labor_cost: 6500 })] });
    expect(amarelo.some((a) => a.id.startsWith("atencao-"))).toBe(true);

    const vermelho = buildAlerts({ ...base, contracts: [report({ hours: 90, labor_cost: 9000 })] });
    expect(vermelho.some((a) => a.id.startsWith("critico-"))).toBe(true);
  });

  it("alerta risco pela projeção mesmo com margem boa hoje", () => {
    const period = { from: "2026-03-01", to: "2026-03-31", today: "2026-03-10" };
    const alerts = buildAlerts({ ...base, contracts: [report({}, period)] });
    const projecao = alerts.find((a) => a.id.startsWith("projecao-"));
    expect(projecao).toBeDefined();
    expect(projecao!.detail).toContain("ritmo atual");
  });

  it("alerta colaborador sem apontar há X dias úteis", () => {
    // 11/03/2026 é quarta; até 17/03 (terça) são 4 dias úteis sem apontar
    const alerts = buildAlerts({
      ...base,
      employees: [{ employee_id: "e1", employee_name: "Bruno", hours: 10, last_entry_date: "2026-03-11" }],
    });
    expect(alerts.some((a) => a.title.includes("Bruno") && a.title.includes("dias úteis"))).toBe(true);
  });

  it("não alerta quem apontou ontem", () => {
    const alerts = buildAlerts({
      ...base,
      employees: [{ employee_id: "e1", employee_name: "Bruno", hours: 10, last_entry_date: "2026-03-16" }],
    });
    expect(alerts).toHaveLength(0);
  });

  it("lista pendências de aprovação e ordena por gravidade", () => {
    const alerts = buildAlerts({
      ...base,
      pendingCount: 7,
      contracts: [report({ hours: 90, labor_cost: 9000 })],
      missingCosts: [{ employee_id: "e1", employee_name: "Carla", hours_last_90_days: 10 }],
    });
    expect(alerts.map((a) => a.level)).toEqual([...alerts.map((a) => a.level)].sort());
    expect(alerts[0].level).toBe("critico");
    expect(alerts.at(-1)!.title).toContain("aguardando aprovação");
  });
});
