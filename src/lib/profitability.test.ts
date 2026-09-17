import { describe, expect, it } from "vitest";
import {
  computeProfitability,
  daysBetween,
  healthStatus,
  projectClosing,
  suggestedAdjustment,
  suggestedRevenue,
  sumProfitability,
  type ContractMetricsRow,
} from "./profitability";

const base: ContractMetricsRow = {
  contract_id: "c1",
  contract_name: "Contábil mensal",
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
  billable_hours: 45,
  labor_cost: 5000,
  expense_cost: 1000,
  team_cost_per_hour: 100,
  entries_count: 12,
};

const opts = { attentionTolerancePoints: 10 };

describe("rentabilidade do contrato", () => {
  it("calcula receita líquida, custo, lucro e margem", () => {
    const p = computeProfitability(base, opts);
    expect(p.netRevenue).toBe(10000);
    expect(p.totalCost).toBe(6000);
    expect(p.profit).toBe(4000);
    expect(p.realMargin).toBeCloseTo(0.4, 6);
    expect(p.marginGapPoints).toBeCloseTo(10, 6); // 40% contra meta de 30%
    expect(p.status).toBe("saudavel");
  });

  it("desconta impostos antes da margem", () => {
    const p = computeProfitability({ ...base, tax_rate: 6 }, opts);
    expect(p.taxAmount).toBeCloseTo(600, 6);
    expect(p.netRevenue).toBeCloseTo(9400, 6);
    expect(p.profit).toBeCloseTo(3400, 6);
    expect(p.realMargin).toBeCloseTo(3400 / 9400, 6);
  });

  it("calcula valor hora efetivo", () => {
    const p = computeProfitability(base, opts);
    expect(p.effectiveHourlyRate).toBeCloseTo(200, 6); // 10.000 ÷ 50h
  });

  it("calcula o limite de horas para bater a meta e o consumo", () => {
    const p = computeProfitability(base, opts);
    // (10.000 × 0,7 − 1.000) ÷ 100 = 60 horas
    expect(p.hoursLimit).toBeCloseTo(60, 6);
    expect(p.hoursConsumption).toBeCloseTo(50 / 60, 6);
  });

  it("não calcula limite sem custo hora da equipe", () => {
    const p = computeProfitability({ ...base, team_cost_per_hour: null }, opts);
    expect(p.hoursLimit).toBeNull();
    expect(p.hoursConsumption).toBeNull();
  });

  it("consumo acima de 100% quando as horas estouram o limite", () => {
    const p = computeProfitability({ ...base, hours: 75, labor_cost: 7500 }, opts);
    expect(p.hoursConsumption).toBeCloseTo(75 / 60, 6);
    expect(p.profit).toBeCloseTo(1500, 6);
    expect(p.realMargin).toBeCloseTo(0.15, 6);
  });

  it("período sem receita não quebra o cálculo", () => {
    const p = computeProfitability({ ...base, revenue: 0, labor_cost: 500 }, opts);
    expect(p.realMargin).toBeNull();
    // 50h apontadas sem receita: R$ 0 por hora
    expect(p.effectiveHourlyRate).toBe(0);
    expect(p.profit).toBeCloseTo(-1500, 6);
    expect(p.status).toBe("critico");
  });
});

describe("faixas de status", () => {
  it("verde quando atinge a meta", () => {
    expect(healthStatus(0.3, 0.3, 100, 10)).toBe("saudavel");
    expect(healthStatus(0.45, 0.3, 100, 10)).toBe("saudavel");
  });

  it("amarelo dentro da tolerância", () => {
    expect(healthStatus(0.25, 0.3, 100, 10)).toBe("atencao"); // 5 p.p. abaixo
    expect(healthStatus(0.2, 0.3, 100, 10)).toBe("atencao"); // exatamente 10 p.p.
  });

  it("vermelho abaixo da tolerância ou com prejuízo", () => {
    expect(healthStatus(0.19, 0.3, 100, 10)).toBe("critico");
    expect(healthStatus(0.5, 0.3, -1, 10)).toBe("critico");
  });

  it("respeita uma tolerância diferente configurada pela empresa", () => {
    expect(healthStatus(0.19, 0.3, 100, 15)).toBe("atencao");
  });
});

describe("projeção de fechamento", () => {
  const period = { from: "2026-03-01", to: "2026-03-31", today: "2026-03-15" };

  it("extrapola horas e custo pelo ritmo atual", () => {
    const p = computeProfitability(base, opts);
    const proj = projectClosing(base, p, period, opts)!;
    // 15 de 31 dias decorridos
    expect(proj.elapsed).toBeCloseTo(15 / 31, 6);
    expect(proj.projectedHours).toBeCloseTo(50 * (31 / 15), 4);
    expect(proj.projectedLaborCost).toBeCloseTo(5000 * (31 / 15), 4);
    // Gastos extras do período não são extrapolados
    expect(proj.projectedTotalCost).toBeCloseTo(5000 * (31 / 15) + 1000, 4);
    expect(proj.projectedMargin!).toBeLessThan(p.realMargin!);
    expect(proj.projectedStatus).toBe("critico");
  });

  it("no fim do período a projeção coincide com o realizado", () => {
    const p = computeProfitability(base, opts);
    const proj = projectClosing(base, p, { ...period, today: "2026-03-31" }, opts)!;
    expect(proj.elapsed).toBe(1);
    expect(proj.projectedHours).toBeCloseTo(p.hours, 6);
    expect(proj.projectedMargin!).toBeCloseTo(p.realMargin!, 6);
  });

  it("não projeta antes do período começar", () => {
    const p = computeProfitability(base, opts);
    expect(projectClosing(base, p, { from: "2026-04-01", to: "2026-04-30", today: "2026-03-15" }, opts)).toBeNull();
  });
});

describe("sugestão de reajuste", () => {
  it("indica a receita necessária para atingir a margem desejada", () => {
    const row = { ...base, hours: 75, labor_cost: 7500 };
    const p = computeProfitability(row, opts);
    // custo 8.500 com meta de 30% → 8.500 ÷ 0,7 = 12.142,86
    expect(suggestedRevenue(row, p)!).toBeCloseTo(12142.857, 2);
    expect(suggestedAdjustment(row, p)!).toBeCloseTo(0.2142857, 5);
  });

  it("acrescenta os impostos na receita sugerida", () => {
    const row = { ...base, hours: 75, labor_cost: 7500, tax_rate: 6 };
    const p = computeProfitability(row, opts);
    expect(suggestedRevenue(row, p)!).toBeCloseTo(12142.857 / 0.94, 2);
  });

  it("não sugere reajuste sem custo apurado", () => {
    const row = { ...base, hours: 0, labor_cost: 0, expense_cost: 0 };
    const p = computeProfitability(row, opts);
    expect(suggestedRevenue(row, p)).toBeNull();
  });
});

describe("consolidação da empresa", () => {
  it("soma contratos e pondera a meta pela receita", () => {
    const a = computeProfitability(base, opts);
    const b = computeProfitability(
      { ...base, contract_id: "c2", revenue: 5000, desired_margin: 20, labor_cost: 3000, expense_cost: 0, hours: 30 },
      opts,
    );
    const total = sumProfitability([a, b]);
    expect(total.revenue).toBe(15000);
    expect(total.totalCost).toBe(9000);
    expect(total.profit).toBe(6000);
    expect(total.realMargin).toBeCloseTo(0.4, 6);
    expect(total.hours).toBe(80);
    // (30% × 10.000 + 20% × 5.000) ÷ 15.000 = 26,67%
    expect(total.desiredMargin).toBeCloseTo(0.2667, 4);
  });
});

describe("dias do período", () => {
  it("conta inclusive", () => {
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(31);
    expect(daysBetween("2026-03-01", "2026-03-01")).toBe(1);
    expect(daysBetween("2026-02-01", "2026-02-28")).toBe(28);
  });
});
