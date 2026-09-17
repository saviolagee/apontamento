"use client";

import { useState } from "react";
import { PencilLineIcon, TimerIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";
import type { ContractOption } from "./page";
import { EntryForm } from "./entry-form";
import { TimerCard } from "./timer-card";

type ActivityOption = Pick<Tables<"activities">, "id" | "name" | "billable" | "area_id">;

const MODES = [
  { id: "cronometro", label: "Cronômetro", icon: TimerIcon },
  { id: "manual", label: "Lançamento manual", icon: PencilLineIcon },
] as const;

type Mode = (typeof MODES)[number]["id"];

/** Alterna entre cronômetro e lançamento manual, sem sair da página. */
export function EntryModes({
  contracts,
  activities,
  today,
  lockedThrough,
}: {
  contracts: ContractOption[];
  activities: ActivityOption[];
  today: string;
  lockedThrough: string | null;
}) {
  const [mode, setMode] = useState<Mode>("cronometro");

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>{mode === "cronometro" ? "Cronômetro" : "Lançamento manual"}</CardTitle>
          <CardDescription>
            {mode === "cronometro"
              ? "Continua contando se você fechar a página. Ao parar, o tempo vira um apontamento pendente."
              : `Informe a duração (1:30, 1,5 ou 90m) ou o intervalo de horas.${
                  lockedThrough ? " Datas de períodos fechados são bloqueadas." : ""
                }`}
          </CardDescription>
        </div>

        <div role="tablist" aria-label="Forma de lançamento" className="flex rounded-lg border bg-muted/40 p-0.5">
          {MODES.map((item) => {
            const Icon = item.icon;
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(item.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        {mode === "cronometro" ? (
          <TimerCard contracts={contracts} activities={activities} today={today} />
        ) : (
          <EntryForm contracts={contracts} activities={activities} today={today} />
        )}
      </CardContent>
    </Card>
  );
}
