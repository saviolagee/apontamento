"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PERIOD_LABELS, type PeriodPreset } from "@/lib/periods";
import { cn } from "@/lib/utils";

const PRESETS: PeriodPreset[] = ["mes-atual", "mes-anterior", "trimestre", "ano"];

export function PeriodFilter({ preset, from, to }: { preset: PeriodPreset; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [custom, setCustom] = useState({ de: from, ate: to });
  const [open, setOpen] = useState(preset === "personalizado");

  const go = (next: Record<string, string>) => {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    router.push(`${pathname}?${search.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((item) => (
        <Button
          key={item}
          type="button"
          size="sm"
          variant={preset === item ? "default" : "outline"}
          onClick={() => {
            setOpen(false);
            go({ periodo: item, de: "", ate: "" });
          }}
        >
          {PERIOD_LABELS[item]}
        </Button>
      ))}
      <Button
        type="button"
        size="sm"
        variant={preset === "personalizado" ? "default" : "outline"}
        onClick={() => setOpen((v) => !v)}
      >
        Personalizado
      </Button>

      <div className={cn("flex flex-wrap items-center gap-2", open ? "" : "hidden")}>
        <Input
          type="date"
          value={custom.de}
          onChange={(e) => setCustom((c) => ({ ...c, de: e.target.value }))}
          className="w-auto"
          aria-label="Data inicial"
        />
        <span className="text-sm text-muted-foreground">até</span>
        <Input
          type="date"
          value={custom.ate}
          onChange={(e) => setCustom((c) => ({ ...c, ate: e.target.value }))}
          className="w-auto"
          aria-label="Data final"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => go({ periodo: "personalizado", de: custom.de, ate: custom.ate })}
        >
          Aplicar
        </Button>
      </div>
    </div>
  );
}
