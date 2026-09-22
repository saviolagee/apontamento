"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeCheckbox, NativeSelect } from "@/components/native-select";
import { DeleteButton } from "@/components/delete-button";
import { EmptyState } from "@/components/page-header";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import type { Tables } from "@/lib/database.types";
import { createActivityAction, deleteActivityAction, updateActivityAction } from "./actions";

type AreaOption = Pick<Tables<"areas">, "id" | "name" | "active">;
type ActivityWithUsage = Tables<"activities"> & { time_entries: { count: number }[] };

function AreaOptions({ areas, selected }: { areas: AreaOption[]; selected?: string }) {
  return (
    <>
      {areas
        .filter((area) => area.active || area.id === selected)
        .map((area) => (
          <option key={area.id} value={area.id}>
            {area.name}
            {area.active ? "" : " (inativa)"}
          </option>
        ))}
    </>
  );
}

export function ActivityForm({ areas }: { areas: AreaOption[] }) {
  const [state, formAction] = useActionState(createActivityAction, initialActionState);
  const defaultArea = areas.find((a) => a.active)?.id ?? areas[0]?.id;

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-[2fr_1.5fr_auto_auto] sm:items-end">
        <Field label="Nome" htmlFor="name" errors={state.fieldErrors?.name}>
          <Input id="name" name="name" required placeholder="Apuração fiscal" />
        </Field>
        <Field label="Área de atuação" htmlFor="areaId" errors={state.fieldErrors?.areaId}>
          <NativeSelect id="areaId" name="areaId" defaultValue={defaultArea} required>
            <AreaOptions areas={areas} />
          </NativeSelect>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm whitespace-nowrap">
          <NativeCheckbox name="billable" defaultChecked />
          Faturável
        </label>
        <SubmitButton>Adicionar</SubmitButton>
      </div>
    </form>
  );
}

function ActivityRow({ activity, areas }: { activity: ActivityWithUsage; areas: AreaOption[] }) {
  const [state, formAction] = useActionState(updateActivityAction, initialActionState);
  const entriesCount = activity.time_entries?.[0]?.count ?? 0;

  return (
    <TableRow>
      <TableCell colSpan={6} className="p-0">
        <form
          action={formAction}
          className="grid items-center gap-3 px-3 py-2 sm:grid-cols-[2fr_1.5fr_auto_auto_auto_auto]"
        >
          <input type="hidden" name="id" value={activity.id} />
          <Input name="name" defaultValue={activity.name} aria-label="Nome da atividade" required />
          <NativeSelect name="areaId" defaultValue={activity.area_id} aria-label="Área" required>
            <AreaOptions areas={areas} selected={activity.area_id} />
          </NativeSelect>
          <label className="flex items-center gap-2 text-sm whitespace-nowrap">
            <NativeCheckbox name="billable" defaultChecked={activity.billable} />
            Faturável
          </label>
          <label className="flex items-center gap-2 text-sm whitespace-nowrap">
            <NativeCheckbox name="active" defaultChecked={activity.active} />
            Ativa
          </label>
          <SubmitButton size="sm" variant="outline">
            Salvar
          </SubmitButton>
          {entriesCount > 0 ? (
            <span
              className="text-xs text-muted-foreground"
              title="Já tem apontamentos registrados. Desative em vez de excluir."
            >
              {entriesCount} apontamento(s)
            </span>
          ) : (
            <DeleteButton
              action={deleteActivityAction}
              hiddenFields={{ id: activity.id }}
              title="Excluir atividade"
              description={`Tem certeza que deseja excluir a atividade "${activity.name}"? Essa ação não pode ser desfeita.`}
            />
          )}
          {state.error || state.success ? (
            <div className="sm:col-span-6">
              <FormAlert state={state} />
            </div>
          ) : null}
        </form>
      </TableCell>
    </TableRow>
  );
}

export function ActivitiesTable({
  activities,
  areas,
}: {
  activities: ActivityWithUsage[];
  areas: AreaOption[];
}) {
  if (!activities.length) return <EmptyState>Nenhuma atividade cadastrada ainda.</EmptyState>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead colSpan={6}>Atividade</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {activities.map((activity) => (
          <ActivityRow key={activity.id} activity={activity} areas={areas} />
        ))}
      </TableBody>
    </Table>
  );
}
