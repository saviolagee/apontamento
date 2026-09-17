"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import type { Tables } from "@/lib/database.types";
import type { ContractOption } from "./page";
import { createTimeEntryAction } from "./actions";

type ActivityOption = Pick<Tables<"activities">, "id" | "name" | "billable" | "area_id">;

export function ContractSelect({
  contracts,
  defaultValue,
  id = "contractId",
  name = "contractId",
}: {
  contracts: ContractOption[];
  defaultValue?: string | null;
  id?: string;
  name?: string;
}) {
  const grouped = contracts.reduce<Record<string, ContractOption[]>>((acc, contract) => {
    (acc[contract.clientName] ??= []).push(contract);
    return acc;
  }, {});

  return (
    <NativeSelect id={id} name={name} defaultValue={defaultValue ?? ""}>
      <option value="">Sem contrato (interno)</option>
      {Object.entries(grouped).map(([client, items]) => (
        <optgroup key={client} label={client}>
          {items.map((contract) => (
            <option key={contract.id} value={contract.id}>
              {contract.name}
            </option>
          ))}
        </optgroup>
      ))}
    </NativeSelect>
  );
}

export function ActivitySelect({
  activities,
  defaultValue,
  id = "activityId",
  name = "activityId",
}: {
  activities: ActivityOption[];
  defaultValue?: string;
  id?: string;
  name?: string;
}) {
  return (
    <NativeSelect id={id} name={name} defaultValue={defaultValue ?? ""} required>
      <option value="" disabled>
        Selecione
      </option>
      {activities.map((activity) => (
        <option key={activity.id} value={activity.id}>
          {activity.name}
          {activity.billable ? "" : " (não faturável)"}
        </option>
      ))}
    </NativeSelect>
  );
}

export function EntryForm({
  contracts,
  activities,
  today,
}: {
  contracts: ContractOption[];
  activities: ActivityOption[];
  today: string;
}) {
  const [state, formAction] = useActionState(createTimeEntryAction, initialActionState);
  const [useInterval, setUseInterval] = useState(false);

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Data" htmlFor="entryDate" errors={state.fieldErrors?.entryDate}>
          <Input id="entryDate" name="entryDate" type="date" defaultValue={today} required />
        </Field>
        <Field label="Cliente / contrato" htmlFor="contractId" errors={state.fieldErrors?.contractId}>
          <ContractSelect contracts={contracts} />
        </Field>
        <Field label="Atividade" htmlFor="activityId" errors={state.fieldErrors?.activityId}>
          <ActivitySelect activities={activities} />
        </Field>
        {useInterval ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Início" htmlFor="startTime" errors={state.fieldErrors?.startTime}>
              <Input id="startTime" name="startTime" type="time" required />
            </Field>
            <Field label="Fim" htmlFor="endTime" errors={state.fieldErrors?.endTime}>
              <Input id="endTime" name="endTime" type="time" required />
            </Field>
          </div>
        ) : (
          <Field label="Duração" htmlFor="duration" hint="1:30 · 1,5 · 90m" errors={state.fieldErrors?.duration}>
            <Input id="duration" name="duration" placeholder="1:30" required />
          </Field>
        )}
      </div>

      <Field label="Descrição" htmlFor="description" errors={state.fieldErrors?.description}>
        <Input id="description" name="description" placeholder="O que foi feito" />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Lançar horas</SubmitButton>
        <button
          type="button"
          onClick={() => setUseInterval((v) => !v)}
          className="text-sm text-muted-foreground underline"
        >
          {useInterval ? "Informar duração" : "Informar hora de início e fim"}
        </button>
      </div>
    </form>
  );
}
