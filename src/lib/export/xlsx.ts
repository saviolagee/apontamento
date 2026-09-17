import ExcelJS from "exceljs";
import { headerLabel, type Dataset } from "./dataset";

const NUMBER_FORMAT: Record<string, string> = {
  currency: '"R$" #,##0.00',
  percent: "0.0%",
  hours: "#,##0.00",
  number: "#,##0.00",
};

/** Planilha .xlsx com números de verdade (dá para somar e filtrar no Excel). */
export async function buildXlsx<T>(dataset: Dataset<T>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Apontamento";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(dataset.title.slice(0, 31));

  sheet.columns = dataset.columns.map((column) => ({
    header: headerLabel(column),
    key: column.header,
    width: Math.max(14, Math.min(42, headerLabel(column).length + 4)),
    style: NUMBER_FORMAT[column.type] ? { numFmt: NUMBER_FORMAT[column.type] } : undefined,
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of dataset.rows) {
    sheet.addRow(dataset.columns.map((column) => column.value(row)));
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: dataset.columns.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
