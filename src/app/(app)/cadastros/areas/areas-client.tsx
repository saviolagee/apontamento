"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeCheckbox } from "@/components/native-select";
import { DeleteButton } from "@/components/delete-button";
import { EmptyState } from "@/components/page-header";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import type { Tables } from "@/lib/database.types";
import { createAreaAction, deleteAreaAction, updateAreaAction } from "./actions";

export function AreaForm() {
  const [state, formAction] = useActionState(createAreaAction, initialActionState);

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <Field label="Nome" htmlFor="name" errors={state.fieldErrors?.name}>
          <Input id="name" name="name" required placeholder="Contábil" />
        </Field>
        <Field label="Descrição" htmlFor="description" errors={state.fieldErrors?.description}>
          <Input id="description" name="description" placeholder="Rotinas contábeis e fechamentos" />
        </Field>
        <SubmitButton>Adicionar</SubmitButton>
      </div>
    </form>
  );
}

function AreaRow({ area }: { area: Tables<"areas"> & { activities: { count: number }[] } }) {
  const [state, formAction] = useActionState(updateAreaAction, initialActionState);
  const activityCount = area.activities?.[0]?.count ?? 0;

  return (
    <TableRow>
      <TableCell colSpan={4} className="p-0">
        <form action={formAction} className="grid items-center gap-3 px-3 py-2 sm:grid-cols-[1fr_2fr_auto_auto_auto]">
          <input type="hidden" name="id" value={area.id} />
          <Input name="name" defaultValue={area.name} aria-label="Nome da área" required />
          <Input
            name="description"
            defaultValue={area.description ?? ""}
            aria-label="Descrição"
            placeholder="Sem descrição"
          />
          <label className="flex items-center gap-2 text-sm whitespace-nowrap">
            <NativeCheckbox name="active" defaultChecked={area.active} />
            Ativa
          </label>
          <div className="flex items-center gap-3">
            <SubmitButton size="sm" variant="outline">
              Salvar
            </SubmitButton>
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {activityCount} atividade(s)
            </span>
          </div>
          {activityCount > 0 ? (
            <span
              className="text-xs text-muted-foreground"
              title="Mova ou exclua as atividades antes de excluir a área."
            >
              —
            </span>
          ) : (
            <DeleteButton
              action={deleteAreaAction}
              hiddenFields={{ id: area.id }}
              title="Excluir área"
              description={`Tem certeza que deseja excluir a área "${area.name}"? Essa ação não pode ser desfeita.`}
            />
          )}
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

export function AreasTable({ areas }: { areas: (Tables<"areas"> & { activities: { count: number }[] })[] }) {
  if (!areas.length) return <EmptyState>Nenhuma área cadastrada ainda.</EmptyState>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead colSpan={4}>Área</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {areas.map((area) => (
          <AreaRow key={area.id} area={area} />
        ))}
      </TableBody>
    </Table>
  );
}
