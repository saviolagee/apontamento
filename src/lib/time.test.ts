import { describe, expect, it } from "vitest";
import {
  addDays,
  businessDaysBetween,
  endOfMonth,
  minutesToInput,
  parseDurationToMinutes,
  startOfWeek,
  weekDays,
} from "./time";

describe("duração", () => {
  it("aceita hh:mm, decimal e abreviações", () => {
    expect(parseDurationToMinutes("1:30")).toBe(90);
    expect(parseDurationToMinutes("0:15")).toBe(15);
    expect(parseDurationToMinutes("1,5")).toBe(90);
    expect(parseDurationToMinutes("2")).toBe(120);
    expect(parseDurationToMinutes("2h")).toBe(120);
    expect(parseDurationToMinutes("2h30")).toBe(150);
    expect(parseDurationToMinutes("45m")).toBe(45);
  });

  it("rejeita entradas inválidas", () => {
    expect(parseDurationToMinutes("")).toBeNull();
    expect(parseDurationToMinutes("abc")).toBeNull();
    expect(parseDurationToMinutes("1:75")).toBeNull();
    expect(parseDurationToMinutes("-2")).toBeNull();
  });

  it("formata minutos para edição", () => {
    expect(minutesToInput(90)).toBe("1:30");
    expect(minutesToInput(60)).toBe("1:00");
    expect(minutesToInput(5)).toBe("0:05");
  });
});

describe("semanas e dias", () => {
  it("a semana começa na segunda", () => {
    // 2026-09-17 é uma quinta-feira
    expect(startOfWeek("2026-09-17")).toBe("2026-09-14");
    expect(startOfWeek("2026-09-14")).toBe("2026-09-14");
    // domingo pertence à semana que começou na segunda anterior
    expect(startOfWeek("2026-09-20")).toBe("2026-09-14");
  });

  it("gera os sete dias da semana", () => {
    expect(weekDays("2026-09-14")).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });

  it("soma dias atravessando o fim do mês e do ano", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("conhece o fim do mês, inclusive fevereiro bissexto", () => {
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(endOfMonth("2026-09-01")).toBe("2026-09-30");
  });

  it("conta dias úteis", () => {
    // 14/09/2026 (seg) a 20/09/2026 (dom) = 5 dias úteis
    expect(businessDaysBetween("2026-09-14", "2026-09-20")).toBe(5);
    expect(businessDaysBetween("2026-09-19", "2026-09-20")).toBe(0);
  });
});
