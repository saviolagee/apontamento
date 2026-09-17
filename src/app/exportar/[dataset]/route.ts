import { NextResponse, type NextRequest } from "next/server";
import { requireContext } from "@/lib/auth/session";
import { formatDateTime, todayISO } from "@/lib/format";
import { resolvePeriod } from "@/lib/periods";
import { buildCsv } from "@/lib/export/csv";
import { buildPdf } from "@/lib/export/pdf";
import { buildXlsx } from "@/lib/export/xlsx";
import { buildDataset, EXPORT_DATASETS, type ExportDataset } from "@/lib/export/datasets";
import { sanitizeFilename } from "@/lib/export/dataset";

const FORMATS = {
  csv: { extension: "csv", contentType: "text/csv; charset=utf-8" },
  xlsx: {
    extension: "xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  pdf: { extension: "pdf", contentType: "application/pdf" },
} as const;

type Format = keyof typeof FORMATS;

export async function GET(request: NextRequest, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  if (!EXPORT_DATASETS.includes(dataset as ExportDataset)) {
    return NextResponse.json({ error: "Relatório desconhecido." }, { status: 404 });
  }

  const { tenant } = await requireContext();
  const search = request.nextUrl.searchParams;
  const format = (search.get("formato") ?? "csv") as Format;
  if (!(format in FORMATS)) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
  }

  // O relatório respeita exatamente o filtro aplicado na tela
  const period = resolvePeriod(todayISO(), {
    periodo: search.get("periodo") ?? undefined,
    de: search.get("de") ?? undefined,
    ate: search.get("ate") ?? undefined,
  });
  const scope = search.get("escopo") === "meus" ? "meus" : undefined;

  const data = await buildDataset(dataset as ExportDataset, period, { scope });
  const { extension, contentType } = FORMATS[format];
  const filename = `${sanitizeFilename(data.filename)}.${extension}`;

  const body =
    format === "csv"
      ? Buffer.from(buildCsv(data), "utf8")
      : format === "xlsx"
        ? await buildXlsx(data)
        : await buildPdf(data, { company: tenant.name, generatedAt: formatDateTime(new Date()) });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
