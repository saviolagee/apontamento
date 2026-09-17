import { formatCell, headerLabel, type Dataset } from "./dataset";

const SEPARATOR = ";";
const BOM = "﻿";

function escape(value: string): string {
  if (value.includes(SEPARATOR) || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * CSV no formato que o Excel brasileiro abre sem assistente: separador `;`,
 * decimal com vírgula e BOM para os acentos aparecerem.
 */
export function buildCsv<T>(dataset: Dataset<T>): string {
  const header = dataset.columns.map((column) => escape(headerLabel(column))).join(SEPARATOR);
  const lines = dataset.rows.map((row) =>
    dataset.columns.map((column) => escape(formatCell(column.value(row), column.type))).join(SEPARATOR),
  );
  return BOM + [header, ...lines].join("\r\n") + "\r\n";
}
