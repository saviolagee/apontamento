import { APP_TIMEZONE } from "@/lib/format";

/** "1:30" → 90 · "1,5" → 90 · "45m" → 45 · "2h" → 120. Retorna null se inválido. */
export function parseDurationToMinutes(input: string): number | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;

  const hhmm = value.match(/^(\d{1,3}):([0-5]\d)$/);
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);

  const hAndM = value.match(/^(\d{1,3})\s*h\s*([0-5]?\d)?\s*m?$/);
  if (hAndM) return Number(hAndM[1]) * 60 + Number(hAndM[2] ?? 0);

  const onlyMinutes = value.match(/^(\d{1,4})\s*m(in)?$/);
  if (onlyMinutes) return Number(onlyMinutes[1]);

  const decimal = Number(value.replace(",", "."));
  if (Number.isFinite(decimal) && decimal > 0) return Math.round(decimal * 60);

  return null;
}

export function minutesToHours(minutes: number): number {
  return minutes / 60;
}

/** 90 → "1:30" (para preencher campos de edição). */
export function minutesToInput(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

export const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function toDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** Segunda-feira da semana da data informada. */
export function startOfWeek(iso: string): string {
  const d = toDate(iso);
  const weekday = (d.getUTCDay() + 6) % 7; // 0 = segunda
  return addDays(iso, -weekday);
}

export function weekDays(startISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startISO, i));
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return toISO(new Date(Date.UTC(year, month, 0, 12)));
}

/** Dias úteis (seg–sex) entre duas datas, inclusive. */
export function businessDaysBetween(startISO: string, endISO: string): number {
  let count = 0;
  for (let d = startISO; d <= endISO; d = addDays(d, 1)) {
    const weekday = toDate(d).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

/** Hora atual (HH:MM) no fuso da aplicação. */
export function nowTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}
