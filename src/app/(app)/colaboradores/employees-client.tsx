"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { createEmployeeAction } from "./actions";

export function NewEmployeeForm({ defaultMonthlyHours }: { defaultMonthlyHours: number }) {
  const [state, formAction] = useActionState(createEmployeeAction, initialActionState);

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-4 sm:items-end">
        <Field label="Nome" htmlFor="fullName" errors={state.fieldErrors?.fullName}>
          <Input id="fullName" name="fullName" required />
        </Field>
        <Field label="E-mail" htmlFor="email" errors={state.fieldErrors?.email}>
          <Input id="email" name="email" type="email" />
        </Field>
        <Field label="Cargo" htmlFor="jobTitle" errors={state.fieldErrors?.jobTitle}>
          <Input id="jobTitle" name="jobTitle" placeholder="Analista contábil" />
        </Field>
        <Field
          label="Horas/mês"
          htmlFor="monthlyHours"
          hint={`Padrão: ${defaultMonthlyHours.toLocaleString("pt-BR")}h`}
          errors={state.fieldErrors?.monthlyHours}
        >
          <Input id="monthlyHours" name="monthlyHours" inputMode="decimal" placeholder={String(defaultMonthlyHours)} />
        </Field>
      </div>
      <div>
        <SubmitButton>Cadastrar colaborador</SubmitButton>
      </div>
    </form>
  );
}
