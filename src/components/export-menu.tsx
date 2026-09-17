"use client";

import { useSearchParams } from "next/navigation";
import { DownloadIcon, FileSpreadsheetIcon, FileTextIcon, SheetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExportDataset } from "@/lib/export/datasets";

const FORMATS = [
  { format: "csv", label: "CSV (abre no Excel)", icon: SheetIcon },
  { format: "xlsx", label: "Excel (.xlsx)", icon: FileSpreadsheetIcon },
  { format: "pdf", label: "PDF", icon: FileTextIcon },
] as const;

/** Exporta o relatório mantendo o período e os filtros da URL. */
export function ExportMenu({
  dataset,
  label = "Exportar",
  scope,
}: {
  dataset: ExportDataset;
  label?: string;
  scope?: "meus" | "todos";
}) {
  const params = useSearchParams();

  const href = (format: string) => {
    const search = new URLSearchParams();
    for (const key of ["periodo", "de", "ate"]) {
      const value = params.get(key);
      if (value) search.set(key, value);
    }
    if (scope) search.set("escopo", scope);
    search.set("formato", format);
    return `/exportar/${dataset}?${search.toString()}`;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            <DownloadIcon />
            {label}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Baixar com o filtro atual</DropdownMenuLabel>
        {FORMATS.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.format} render={<a href={href(item.format)} download />}>
              <Icon />
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
