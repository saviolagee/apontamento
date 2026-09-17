import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatCell, headerLabel, type Dataset } from "./dataset";

const PAGE = { width: 842, height: 595 }; // A4 paisagem
const MARGIN = 36;
const FONT_SIZE = 8.5;
const ROW_HEIGHT = 16;

const ink = rgb(0.05, 0.05, 0.05);
const muted = rgb(0.45, 0.45, 0.45);
const line = rgb(0.85, 0.85, 0.85);
const zebra = rgb(0.97, 0.97, 0.96);

/** Corta o texto para caber na largura da coluna. */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

export async function buildPdf<T>(dataset: Dataset<T>, meta: { company: string; generatedAt: string }): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(dataset.title);
  pdf.setCreator("Apontamento");

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const usableWidth = PAGE.width - MARGIN * 2;
  // Colunas de texto ficam mais largas que as numéricas
  const weights = dataset.columns.map((column) => (column.type === "text" || column.type === "date" ? 2 : 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / totalWeight) * usableWidth);

  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
  let y = 0;

  const drawHeader = (pageNumber: number) => {
    y = PAGE.height - MARGIN;
    page.drawText(dataset.title, { x: MARGIN, y: y - 10, size: 14, font: bold, color: ink });
    y -= 26;
    const subtitle = [meta.company, dataset.subtitle].filter(Boolean).join(" · ");
    page.drawText(subtitle, { x: MARGIN, y, size: 9, font, color: muted });
    page.drawText(`Gerado em ${meta.generatedAt} · página ${pageNumber}`, {
      x: PAGE.width - MARGIN - font.widthOfTextAtSize(`Gerado em ${meta.generatedAt} · página ${pageNumber}`, 8),
      y,
      size: 8,
      font,
      color: muted,
    });
    y -= 18;

    let x = MARGIN;
    dataset.columns.forEach((column, index) => {
      const label = fit(headerLabel(column), bold, FONT_SIZE, widths[index] - 6);
      const numeric = column.type !== "text" && column.type !== "date";
      page.drawText(label, {
        x: numeric ? x + widths[index] - 4 - bold.widthOfTextAtSize(label, FONT_SIZE) : x + 2,
        y,
        size: FONT_SIZE,
        font: bold,
        color: ink,
      });
      x += widths[index];
    });
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE.width - MARGIN, y },
      thickness: 0.8,
      color: line,
    });
    y -= ROW_HEIGHT;
  };

  let pageNumber = 1;
  drawHeader(pageNumber);

  dataset.rows.forEach((row, rowIndex) => {
    if (y < MARGIN + ROW_HEIGHT) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      pageNumber += 1;
      drawHeader(pageNumber);
    }

    if (rowIndex % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 4,
        width: usableWidth,
        height: ROW_HEIGHT,
        color: zebra,
      });
    }

    let x = MARGIN;
    dataset.columns.forEach((column, index) => {
      const text = fit(formatCell(column.value(row), column.type), font, FONT_SIZE, widths[index] - 6);
      const numeric = column.type !== "text" && column.type !== "date";
      page.drawText(text, {
        x: numeric ? x + widths[index] - 4 - font.widthOfTextAtSize(text, FONT_SIZE) : x + 2,
        y,
        size: FONT_SIZE,
        font,
        color: ink,
      });
      x += widths[index];
    });
    y -= ROW_HEIGHT;
  });

  if (dataset.rows.length === 0) {
    page.drawText("Nenhum registro no período selecionado.", {
      x: MARGIN,
      y,
      size: FONT_SIZE,
      font,
      color: muted,
    });
  }

  return Buffer.from(await pdf.save());
}
