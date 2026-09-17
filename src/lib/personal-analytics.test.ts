import { describe, expect, it } from "vitest";
import { analyzeMyHours, type MyHoursRow } from "./personal-analytics";

const row = (over: Partial<MyHoursRow>): MyHoursRow => ({
  entry_date: "2026-09-14",
  contract_id: "c1",
  contract_name: "Mensal",
  client_name: "Cliente Um",
  activity_id: "a1",
  activity_name: "Apuração",
  area_id: "ar1",
  area_name: "Contábil",
  billable: true,
  hours: 8,
  ...over,
});

// Setembro/2026: dia 14 é segunda, 17 é quinta
const period = { from: "2026-09-01", to: "2026-09-30", today: "2026-09-17" };
const dailyTarget = 8;

describe("análises do colaborador", () => {
  const rows = [
    row({ entry_date: "2026-09-14", hours: 8 }),
    row({ entry_date: "2026-09-15", hours: 6 }),
    row({ entry_date: "2026-09-15", hours: 2, activity_name: "Reunião interna", billable: false, client_name: null, contract_id: null }),
    row({ entry_date: "2026-09-17", hours: 4, client_name: "Cliente Dois", area_name: "Consultoria" }),
  ];

  it("soma horas do dia, da semana e do período", () => {
    const a = analyzeMyHours(rows, period, dailyTarget);
    expect(a.totalHours).toBe(20);
    expect(a.hoursToday).toBe(4);
    expect(a.hoursThisWeek).toBe(20); // semana de 14 a 20/09
  });

  it("compara com a jornada esperada só até hoje", () => {
    const a = analyzeMyHours(rows, period, dailyTarget);
    // 01 a 17/09 = 13 dias úteis × 8h
    expect(a.expectedHours).toBe(104);
    expect(a.balance).toBe(20 - 104);
    expect(a.expectedToday).toBe(8);
    expect(a.expectedThisWeek).toBe(32); // segunda a quinta
  });

  it("não cobra jornada em fim de semana", () => {
    const sexta = analyzeMyHours(rows, { ...period, today: "2026-09-18" }, dailyTarget);
    expect(sexta.expectedToday).toBe(8);
    // 19 e 20/09 caem no fim de semana
    expect(analyzeMyHours(rows, { ...period, today: "2026-09-19" }, dailyTarget).expectedToday).toBe(0);
    expect(analyzeMyHours(rows, { ...period, today: "2026-09-20" }, dailyTarget).expectedToday).toBe(0);
  });

  it("calcula o percentual faturável", () => {
    const a = analyzeMyHours(rows, period, dailyTarget);
    expect(a.billableHours).toBe(18);
    expect(a.billableShare).toBeCloseTo(0.9, 6);
  });

  it("distribui por cliente, atividade e área", () => {
    const a = analyzeMyHours(rows, period, dailyTarget);
    expect(a.byClient.map((d) => [d.label, d.hours])).toEqual([
      ["Cliente Um", 14],
      ["Cliente Dois", 4],
      ["Interno", 2],
    ]);
    expect(a.byActivity[0]).toMatchObject({ label: "Apuração", hours: 18 });
    expect(a.byClient[0].share).toBeCloseTo(0.7, 6);
    expect(a.byArea.map((d) => d.label)).toEqual(["Contábil", "Consultoria"]);
  });

  it("lista dias úteis sem apontamento até hoje", () => {
    const a = analyzeMyHours(rows, period, dailyTarget);
    // Úteis de 01 a 17 sem lançamento: 01–04, 07–11 e 16
    expect(a.missingDays).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-16",
    ]);
    // Nada depois de hoje entra na conta
    expect(a.missingDays.every((d) => d <= period.today)).toBe(true);
  });

  it("guarda o histórico por dia e o último apontamento", () => {
    const a = analyzeMyHours(rows, period, dailyTarget);
    expect(a.byDay).toEqual([
      { date: "2026-09-14", hours: 8 },
      { date: "2026-09-15", hours: 8 },
      { date: "2026-09-17", hours: 4 },
    ]);
    expect(a.lastEntryDate).toBe("2026-09-17");
  });

  it("período sem apontamentos", () => {
    const a = analyzeMyHours([], period, dailyTarget);
    expect(a.totalHours).toBe(0);
    expect(a.billableShare).toBe(0);
    expect(a.lastEntryDate).toBeNull();
    expect(a.missingDays).toHaveLength(13);
  });

  it("período futuro não gera cobrança de jornada", () => {
    const a = analyzeMyHours([], { from: "2026-10-01", to: "2026-10-31", today: "2026-09-17" }, dailyTarget);
    expect(a.expectedHours).toBe(0);
    expect(a.missingDays).toHaveLength(0);
  });
});
