"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, LockIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/page-header";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { formatDate, formatHours } from "@/lib/format";
import { addDays, minutesToInput, WEEKDAY_LABELS } from "@/lib/time";
import type { Tables, TimeEntryStatus } from "@/lib/database.types";
import type { ContractOption } from "./page";
import { deleteTimeEntryAction, updateTimeEntryAction } from "./actions";
import { ActivitySelect, ContractSelect } from "./entry-form";

type ActivityOption = Pick<Tables<"activities">, "id" | "name" | "billable" | "area_id">;

const STATUS_VARIANT: Record<TimeEntryStatus, "default" | "secondary" | "destructive"> = {
  pendente: "secondary",
  aprovado: "default",
  rejeitado: "destructive",
};

const STATUS_LABEL: Record<TimeEntryStatus, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};

function EntryRow({
  entry,
  contracts,
  activities,
  locked,
}: {
  entry: Tables<"time_entries">;
  contracts: ContractOption[];
  activities: ActivityOption[];
  locked: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(updateTimeEntryAction, initialActionState);
  const [deleteState, deleteAction] = useActionState(deleteTimeEntryAction, initialActionState);

  const contract = contracts.find((c) => c.id === entry.contract_id);
  const activity = activities.find((a) => a.id === entry.activity_id);
  const canEdit = entry.status === "pendente" && !locked;

  if (editing) {
    return (
      <div className="grid gap-3 rounded-lg border p-3">
        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="id" value={entry.id} />
          <FormAlert state={state} />
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Data" htmlFor={`date-${entry.id}`} errors={state.fieldErrors?.entryDate}>
              <Input id={`date-${entry.id}`} name="entryDate" type="date" defaultValue={entry.entry_date} required />
            </Field>
            <Field label="Cliente / contrato" htmlFor={`contract-${entry.id}`}>
              <ContractSelect contracts={contracts} id={`contract-${entry.id}`} defaultValue={entry.contract_id} />
            </Field>
            <Field label="Atividade" htmlFor={`activity-${entry.id}`}>
              <ActivitySelect activities={activities} id={`activity-${entry.id}`} defaultValue={entry.activity_id} />
            </Field>
            <Field label="Duração" htmlFor={`duration-${entry.id}`} errors={state.fieldErrors?.duration}>
              <Input id={`duration-${entry.id}`} name="duration" defaultValue={minutesToInput(entry.minutes)} required />
            </Field>
          </div>
          <Field label="Descrição" htmlFor={`desc-${entry.id}`}>
            <Input id={`desc-${entry.id}`} name="description" defaultValue={entry.description ?? ""} />
          </Field>
          <div className="flex items-center gap-2">
            <SubmitButton size="sm">Salvar</SubmitButton>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <XIcon />
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <div className="min-w-0">
        <p className="font-medium">
          {formatHours(entry.minutes / 60)}
          <span className="ml-2 font-normal">
            {contract ? `${contract.clientName} · ${contract.name}` : "Interno"}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {activity?.name ?? "Atividade"}
          {entry.billable ? "" : " · não faturável"}
          {entry.description ? ` · ${entry.description}` : ""}
          {entry.start_time && entry.end_time
            ? ` · ${entry.start_time.slice(0, 5)}–${entry.end_time.slice(0, 5)}`
            : ""}
        </p>
        {entry.review_comment ? (
          <p className="text-xs text-destructive">Comentário do gestor: {entry.review_comment}</p>
        ) : null}
        {deleteState.error ? <p className="text-xs text-destructive">{deleteState.error}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={STATUS_VARIANT[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
        {canEdit ? (
          <>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label="Editar">
              <PencilIcon />
            </Button>
            <form action={deleteAction}>
              <input type="hidden" name="id" value={entry.id} />
              <SubmitButton variant="ghost" size="icon-sm">
                <Trash2Icon />
              </SubmitButton>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function WeekEntries({
  weekStart,
  days,
  entries,
  contracts,
  activities,
  monthlyHours,
  lockedThrough,
  today,
}: {
  weekStart: string;
  days: string[];
  entries: Tables<"time_entries">[];
  contracts: ContractOption[];
  activities: ActivityOption[];
  monthlyHours: number;
  lockedThrough: string | null;
  today: string;
}) {
  // Jornada diária esperada ≈ jornada mensal ÷ 21 dias úteis
  const dailyTarget = monthlyHours / 21;
  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
  const billableMinutes = entries.filter((e) => e.billable).reduce((sum, e) => sum + e.minutes, 0);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>Semana de {formatDate(weekStart)}</CardTitle>
          <CardDescription>
            {formatHours(totalMinutes / 60)} apontadas ·{" "}
            {totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0}% faturável
          </CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" render={<Link href={`/apontamentos?semana=${addDays(weekStart, -7)}`} />} aria-label="Semana anterior">
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/apontamentos" />}>
            Hoje
          </Button>
          <Button variant="outline" size="icon-sm" render={<Link href={`/apontamentos?semana=${addDays(weekStart, 7)}`} />} aria-label="Próxima semana">
            <ChevronRightIcon />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, i) => {
            const dayEntries = entries.filter((e) => e.entry_date === day);
            const dayMinutes = dayEntries.reduce((sum, e) => sum + e.minutes, 0);
            const ratio = dailyTarget > 0 ? Math.min(dayMinutes / 60 / dailyTarget, 1) : 0;
            const isWeekend = i >= 5;
            const isToday = day === today;
            const isLocked = lockedThrough !== null && day <= lockedThrough;

            return (
              <div
                key={day}
                className={`grid gap-1 rounded-lg border p-2 text-center ${isToday ? "border-primary" : ""} ${
                  isWeekend ? "bg-muted/40" : ""
                }`}
              >
                <p className="text-xs text-muted-foreground">
                  {WEEKDAY_LABELS[i]} {day.slice(8, 10)}
                </p>
                <p className="text-sm font-medium tabular-nums">{dayMinutes ? formatHours(dayMinutes / 60) : "—"}</p>
                <div className="h-1 rounded-full bg-muted">
                  <div className="h-1 rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
                </div>
                {isLocked ? <LockIcon className="mx-auto size-3 text-muted-foreground" /> : null}
              </div>
            );
          })}
        </div>

        {lockedThrough ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LockIcon className="size-3" />
            Período fechado até {formatDate(lockedThrough)} — lançamentos nessas datas estão bloqueados.
          </p>
        ) : null}

        <div className="grid gap-4">
          {days.map((day) => {
            const dayEntries = entries.filter((e) => e.entry_date === day);
            if (!dayEntries.length) return null;
            return (
              <div key={day} className="grid gap-2">
                <p className="text-sm font-medium">{formatDate(day)}</p>
                {dayEntries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    contracts={contracts}
                    activities={activities}
                    locked={lockedThrough !== null && entry.entry_date <= lockedThrough}
                  />
                ))}
              </div>
            );
          })}
          {entries.length === 0 ? <EmptyState>Nenhuma hora apontada nesta semana.</EmptyState> : null}
        </div>
      </CardContent>
    </Card>
  );
}
