"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { setPeriodLockAction } from "../../apontamentos/actions";

export function PeriodLockForm({
  lockedThrough,
  suggestions,
}: {
  lockedThrough: string | null;
  suggestions: { label: string; value: string }[];
}) {
  const [state, formAction] = useActionState(setPeriodLockAction, initialActionState);
  const [value, setValue] = useState(lockedThrough ?? "");

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-[240px_auto] sm:items-end">
        <Field
          label="Bloquear lançamentos até"
          htmlFor="lockedThrough"
          hint="Deixe vazio para liberar tudo."
          errors={state.fieldErrors?.lockedThrough}
        >
          <Input
            id="lockedThrough"
            name="lockedThrough"
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <SubmitButton>Salvar fechamento</SubmitButton>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <Button key={s.value} type="button" variant="outline" size="sm" onClick={() => setValue(s.value)}>
            {s.label}
          </Button>
        ))}
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setValue("")}>
            Liberar período
          </Button>
        ) : null}
      </div>
    </form>
  );
}
