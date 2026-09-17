import { addDays, endOfMonth, startOfMonth } from "@/lib/time";

export type PeriodPreset = "mes-atual" | "mes-anterior" | "trimestre" | "ano" | "personalizado";

export type Period = {
  from: string;
  to: string;
  preset: PeriodPreset;
  label: string;
};

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "mes-atual": "Mês atual",
  "mes-anterior": "Mês anterior",
  trimestre: "Últimos 3 meses",
  ano: "Ano atual",
  personalizado: "Personalizado",
};

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function monthLabel(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} de ${year}`;
}

/** Primeiro dia do mês, deslocado em `offset` meses. */
export function shiftMonth(iso: string, offset: number): string {
  const [year, month] = iso.split("-").map(Number);
  const total = year * 12 + (month - 1) + offset;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export function resolvePeriod(
  today: string,
  params: { periodo?: string; de?: string; ate?: string } = {},
): Period {
  const isDate = (v?: string) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const preset = (params.periodo ?? "mes-atual") as PeriodPreset;

  if (preset === "personalizado" && isDate(params.de) && isDate(params.ate)) {
    const from = params.de!;
    const to = params.ate!;
    return { from, to, preset, label: "Período personalizado" };
  }

  switch (preset) {
    case "mes-anterior": {
      const from = shiftMonth(startOfMonth(today), -1);
      return { from, to: endOfMonth(from), preset, label: monthLabel(from) };
    }
    // Períodos em andamento terminam hoje: receita e custo ficam na mesma
    // régua (a receita é normalizada pelos dias), e a projeção cuida do resto.
    case "trimestre": {
      const from = shiftMonth(startOfMonth(today), -2);
      return { from, to: today, preset, label: `${monthLabel(from)} até hoje` };
    }
    case "ano": {
      const year = today.slice(0, 4);
      return { from: `${year}-01-01`, to: today, preset, label: `Ano de ${year} até hoje` };
    }
    default: {
      const from = startOfMonth(today);
      const isClosed = today >= endOfMonth(today);
      return {
        from,
        to: isClosed ? endOfMonth(today) : today,
        preset: "mes-atual",
        label: isClosed ? monthLabel(today) : `${monthLabel(today)} (até hoje)`,
      };
    }
  }
}

/** Meses do intervalo, para séries de evolução mensal. */
export function monthsInRange(from: string, to: string): { from: string; to: string; label: string }[] {
  const months: { from: string; to: string; label: string }[] = [];
  let cursor = startOfMonth(from);
  while (cursor <= to) {
    const monthEnd = endOfMonth(cursor);
    months.push({
      from: cursor > from ? cursor : from,
      to: monthEnd < to ? monthEnd : to,
      label: `${cursor.slice(5, 7)}/${cursor.slice(2, 4)}`,
    });
    cursor = addDays(monthEnd, 1);
  }
  return months;
}
