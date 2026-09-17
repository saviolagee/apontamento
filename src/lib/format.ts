export const APP_TIMEZONE = "America/Sao_Paulo";
export const APP_LOCALE = "pt-BR";

const brl = new Intl.NumberFormat(APP_LOCALE, { style: "currency", currency: "BRL" });
const pct = new Intl.NumberFormat(APP_LOCALE, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTime = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatCurrency(value: number | null | undefined): string {
  return brl.format(value ?? 0);
}

/** Recebe fração (0,25 = 25%). */
export function formatPercent(value: number | null | undefined): string {
  return pct.format(value ?? 0);
}

export function formatNumber(value: number | null | undefined): string {
  return num.format(value ?? 0);
}

/** Horas decimais → "7h30". */
export function formatHours(hours: number | null | undefined): string {
  const totalMinutes = Math.round((hours ?? 0) * 60);
  const sign = totalMinutes < 0 ? "-" : "";
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h${m.toString().padStart(2, "0")}`;
}

/**
 * Datas "puras" (coluna `date`, formato aaaa-mm-dd) são formatadas sem
 * conversão de fuso para não "voltar um dia".
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  return date.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  return dateTime.format(typeof value === "string" ? new Date(value) : value);
}

/** Data de hoje (aaaa-mm-dd) no fuso de São Paulo. */
export function todayISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

export function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function formatCnpj(value: string | null | undefined): string {
  const d = onlyDigits(value);
  if (d.length !== 14) return value ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
