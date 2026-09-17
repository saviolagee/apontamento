import { describe, expect, it } from "vitest";
import { monthsInRange, resolvePeriod, shiftMonth } from "./periods";

describe("períodos", () => {
  const today = "2026-09-17";

  it("mês atual", () => {
    expect(resolvePeriod(today)).toMatchObject({ from: "2026-09-01", to: "2026-09-30", preset: "mes-atual" });
  });

  it("mês anterior", () => {
    expect(resolvePeriod(today, { periodo: "mes-anterior" })).toMatchObject({
      from: "2026-08-01",
      to: "2026-08-31",
      label: "agosto de 2026",
    });
  });

  it("últimos três meses", () => {
    expect(resolvePeriod(today, { periodo: "trimestre" })).toMatchObject({ from: "2026-07-01", to: "2026-09-30" });
  });

  it("ano atual", () => {
    expect(resolvePeriod(today, { periodo: "ano" })).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("personalizado exige as duas datas", () => {
    expect(resolvePeriod(today, { periodo: "personalizado", de: "2026-03-10", ate: "2026-04-05" })).toMatchObject({
      from: "2026-03-10",
      to: "2026-04-05",
    });
    // Sem datas válidas cai no mês atual
    expect(resolvePeriod(today, { periodo: "personalizado", de: "xx" })).toMatchObject({ preset: "mes-atual" });
  });

  it("desloca meses atravessando o ano", () => {
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-09-01", -2)).toBe("2026-07-01");
  });

  it("quebra o intervalo em meses, respeitando as bordas", () => {
    expect(monthsInRange("2026-02-10", "2026-04-05")).toEqual([
      { from: "2026-02-10", to: "2026-02-28", label: "02/26" },
      { from: "2026-03-01", to: "2026-03-31", label: "03/26" },
      { from: "2026-04-01", to: "2026-04-05", label: "04/26" },
    ]);
  });
});
