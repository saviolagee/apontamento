/**
 * Um dataset é a mesma tabela em qualquer formato (CSV, Excel ou PDF):
 * as colunas sabem formatar cada valor em pt-BR.
 */
export type ColumnType = "text" | "number" | "currency" | "percent" | "hours" | "date";

export type Column<T> = {
  header: string;
  type: ColumnType;
  value: (row: T) => string | number | null;
};

export type Dataset<T = unknown> = {
  /** Nome do arquivo, sem extensão. */
  filename: string;
  title: string;
  subtitle?: string;
  columns: Column<T>[];
  rows: T[];
};

const decimal = (value: number, digits = 2) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

/** Valor já formatado para leitura humana (CSV e PDF). */
export function formatCell(value: string | number | null, type: ColumnType): string {
  if (value === null || value === undefined) return "";
  if (type === "text" || type === "date") return String(value);

  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);

  switch (type) {
    case "currency":
      return decimal(n);
    case "percent":
      return `${decimal(n * 100, 1)}%`;
    case "hours":
      return decimal(n, 2);
    default:
      return decimal(n, 2);
  }
}

/** Cabeçalho com a unidade, já que o número vai sem símbolo. */
export function headerLabel<T>(column: Column<T>): string {
  if (column.type === "currency") return `${column.header} (R$)`;
  if (column.type === "hours") return `${column.header} (h)`;
  return column.header;
}

export function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}
