import { describe, expect, it } from "vitest";
import { buildCsv } from "./csv";
import { buildPdf } from "./pdf";
import { buildXlsx } from "./xlsx";
import { formatCell, sanitizeFilename, type Dataset } from "./dataset";

type Row = { cliente: string; receita: number; margem: number | null; horas: number; data: string };

const dataset: Dataset<Row> = {
  filename: "rentabilidade-2026-03-01-a-2026-03-31",
  title: "Rentabilidade por contrato",
  subtitle: "março de 2026",
  rows: [
    { cliente: "Cliente Um", receita: 9400, margem: 0.436, horas: 55, data: "10/03/2026" },
    { cliente: 'Empresa "Dois"; Ltda', receita: 1234.5, margem: null, horas: 7.25, data: "11/03/2026" },
  ],
  columns: [
    { header: "Cliente", type: "text", value: (r) => r.cliente },
    { header: "Receita líquida", type: "currency", value: (r) => r.receita },
    { header: "Margem real", type: "percent", value: (r) => r.margem },
    { header: "Horas", type: "hours", value: (r) => r.horas },
    { header: "Data", type: "date", value: (r) => r.data },
  ],
};

describe("formatação das células", () => {
  it("usa padrão brasileiro e trata vazios", () => {
    expect(formatCell(1234.5, "currency")).toBe("1.234,50");
    expect(formatCell(0.436, "percent")).toBe("43,6%");
    expect(formatCell(7.25, "hours")).toBe("7,25");
    expect(formatCell(null, "currency")).toBe("");
    expect(formatCell("Cliente", "text")).toBe("Cliente");
  });

  it("limpa o nome do arquivo", () => {
    expect(sanitizeFilename("Rentabilidade — março/2026")).toBe("rentabilidade-marco-2026");
  });
});

describe("CSV", () => {
  const csv = buildCsv(dataset);

  it("abre no Excel brasileiro: BOM, ponto e vírgula e vírgula decimal", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    const [header, first] = csv.replace("﻿", "").split("\r\n");
    expect(header).toBe("Cliente;Receita líquida (R$);Margem real;Horas (h);Data");
    expect(first).toBe("Cliente Um;9.400,00;43,6%;55,00;10/03/2026");
  });

  it("escapa aspas e o separador dentro do texto", () => {
    const linha = buildCsv(dataset).split("\r\n")[2];
    expect(linha.startsWith('"Empresa ""Dois""; Ltda"')).toBe(true);
    // Margem nula vira célula vazia
    expect(linha).toContain(";;");
  });
});

describe("Excel", () => {
  it("gera um .xlsx válido com números (não texto)", async () => {
    const buffer = await buildXlsx(dataset);
    // Assinatura de arquivo ZIP (formato do xlsx)
    expect(buffer.subarray(0, 2).toString("binary")).toBe("PK");
    expect(buffer.length).toBeGreaterThan(1000);

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe("Rentabilidade por contrato");
    expect(sheet.getRow(1).getCell(2).value).toBe("Receita líquida (R$)");
    expect(sheet.getRow(2).getCell(2).value).toBe(9400);
    expect(sheet.getRow(2).getCell(3).value).toBeCloseTo(0.436, 6);
  });
});

describe("PDF", () => {
  it("gera um PDF com o título e o período", async () => {
    const buffer = await buildPdf(dataset, { company: "Empresa Teste", generatedAt: "17/09/2026 10:00" });
    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);

    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(buffer);
    expect(pdf.getTitle()).toBe("Rentabilidade por contrato");
    expect(pdf.getPageCount()).toBe(1);
  });

  it("quebra em várias páginas quando a tabela é longa", async () => {
    const many = { ...dataset, rows: Array.from({ length: 120 }, () => dataset.rows[0]) };
    const buffer = await buildPdf(many, { company: "Empresa Teste", generatedAt: "17/09/2026 10:00" });
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(buffer);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("não quebra com dataset vazio", async () => {
    const buffer = await buildPdf({ ...dataset, rows: [] }, { company: "Empresa", generatedAt: "17/09/2026 10:00" });
    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });
});
