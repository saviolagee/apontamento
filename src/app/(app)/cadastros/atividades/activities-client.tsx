"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeCheckbox, NativeSelect } from "@/components/native-select";
import { EmptyState } from "@/components/page-header";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import type { Tables } from "@/lib/database.types";
import { createActivityAction, updateActivityAction } from "./actions";

type AreaOption = Pick<Tables<"areas">, "id" | "name" | "active">;

function AreaOptions({ areas, selected }: { areas: AreaOption[]; selected?: string | null }) {
  return (
    <>
      <option value="">Sem área</option>
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

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-[2fr_1.5fr_auto_auto] sm:items-end">
        <Field label="Nome" htmlFor="name" errors={state.fieldErrors?.name}>
          <Input id="name" name="name" required placeholder="Apuração fiscal" />
        </Field>
        <Field label="Área de atuação" htmlFor="areaId" errors={state.fieldErrors?.areaId}>
          <NativeSelect id="areaId" name="areaId" defaultValue="">
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

function ActivityRow({ activity, areas }: { activity: Tables<"activities">; areas: AreaOption[] }) {
  const [state, formAction] = useActionState(updateActivityAction, initialActionState);

  return (
    <TableRow>
      <TableCell colSpan={5} className="p-0">
        <form
          action={formAction}
          className="grid items-center gap-3 px-3 py-2 sm:grid-cols-[2fr_1.5fr_auto_auto_auto]"
        >
          <input type="hidden" name="id" value={activity.id} />
          <Input name="name" defaultValue={activity.name} aria-label="Nome da atividade" required />
          <NativeSelect name="areaId" defaultValue={activity.area_id ?? ""} aria-label="Área">
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
          {state.error || state.success ? (
            <div className="sm:col-span-5">
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
  activities: Tables<"activities">[];
  areas: AreaOption[];
}) {
  if (!activities.length) return <EmptyState>Nenhuma atividade cadastrada ainda.</EmptyState>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead colSpan={5}>Atividade</TableHead>
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
