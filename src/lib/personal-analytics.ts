import { addDays, businessDaysBetween, startOfWeek } from "@/lib/time";

/** Linha de `public.my_hours_breakdown` (horas do próprio colaborador, sem custo). */
export type MyHoursRow = {
  entry_date: string;
  contract_id: string | null;
  contract_name: string | null;
  client_name: string | null;
  activity_id: string;
  activity_name: string;
  area_id: string | null;
  area_name: string | null;
  billable: boolean;
  hours: number;
};

export type Distribution = { id: string; label: string; hours: number; share: number };

export type PersonalAnalytics = {
  totalHours: number;
  billableHours: number;
  billableShare: number;
  hoursToday: number;
  hoursThisWeek: number;
  /** Jornada esperada no período (dias úteis × jornada diária). */
  expectedHours: number;
  expectedToday: number;
  expectedThisWeek: number;
  balance: number;
  byDay: { date: string; hours: number }[];
  byClient: Distribution[];
  byActivity: Distribution[];
  byArea: Distribution[];
  /** Dias úteis do período, até hoje, sem nenhum apontamento. */
  missingDays: string[];
  lastEntryDate: string | null;
};

function distribution(rows: MyHoursRow[], key: (row: MyHoursRow) => string, total: number): Distribution[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const label = key(row);
    map.set(label, (map.get(label) ?? 0) + Number(row.hours));
  }
  return [...map.entries()]
    .map(([label, hours]) => ({ id: label, label, hours, share: total > 0 ? hours / total : 0 }))
    .sort((a, b) => b.hours - a.hours);
}

/**
 * Consolida as horas do colaborador no período.
 * `dailyTarget` é a jornada diária esperada (jornada mensal ÷ 21 dias úteis).
 */
export function analyzeMyHours(
  rows: MyHoursRow[],
  period: { from: string; to: string; today: string },
  dailyTarget: number,
): PersonalAnalytics {
  const total = rows.reduce((sum, row) => sum + Number(row.hours), 0);
  const billable = rows.filter((row) => row.billable).reduce((sum, row) => sum + Number(row.hours), 0);

  const byDayMap = new Map<string, number>();
  for (const row of rows) {
    byDayMap.set(row.entry_date, (byDayMap.get(row.entry_date) ?? 0) + Number(row.hours));
  }

  const weekStart = startOfWeek(period.today);
  const weekEnd = addDays(weekStart, 6);
  const hoursThisWeek = [...byDayMap.entries()]
    .filter(([date]) => date >= weekStart && date <= weekEnd)
    .reduce((sum, [, hours]) => sum + hours, 0);

  // Só cobra jornada de dias úteis já passados
  const limit = period.today < period.to ? period.today : period.to;
  const businessDays = limit >= period.from ? businessDaysBetween(period.from, limit) : 0;
  const weekBusinessDays = businessDaysBetween(weekStart, limit < weekStart ? weekStart : limit);
  const isBusinessDay = (iso: string) => businessDaysBetween(iso, iso) === 1;

  const missingDays: string[] = [];
  for (let day = period.from; day <= limit; day = addDays(day, 1)) {
    if (isBusinessDay(day) && !byDayMap.has(day)) missingDays.push(day);
  }

  const days = [...byDayMap.keys()].sort();

  return {
    totalHours: total,
    billableHours: billable,
    billableShare: total > 0 ? billable / total : 0,
    hoursToday: byDayMap.get(period.today) ?? 0,
    hoursThisWeek,
    expectedHours: businessDays * dailyTarget,
    expectedToday: isBusinessDay(period.today) ? dailyTarget : 0,
    expectedThisWeek: weekBusinessDays * dailyTarget,
    balance: total - businessDays * dailyTarget,
    byDay: days.map((date) => ({ date, hours: byDayMap.get(date) ?? 0 })),
    byClient: distribution(rows, (row) => row.client_name ?? "Interno", total),
    byActivity: distribution(rows, (row) => row.activity_name, total),
    byArea: distribution(rows, (row) => row.area_name ?? "Sem área", total),
    missingDays,
    lastEntryDate: days.at(-1) ?? null,
  };
}
