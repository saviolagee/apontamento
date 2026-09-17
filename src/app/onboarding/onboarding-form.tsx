"use client";

import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { createTenantAction } from "./actions";

export function OnboardingForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(createTenantAction, initialActionState);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Vamos criar sua empresa</CardTitle>
        <CardDescription>
          Você será o administrador de <span className="font-medium text-foreground">{email}</span> e poderá convidar
          gestores e colaboradores depois.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <FormAlert state={state} />
          <Field label="Seu nome" htmlFor="fullName" errors={state.fieldErrors?.fullName}>
            <Input id="fullName" name="fullName" required autoComplete="name" />
          </Field>
          <Field label="Nome da empresa" htmlFor="companyName" errors={state.fieldErrors?.companyName}>
            <Input id="companyName" name="companyName" required autoComplete="organization" />
          </Field>
          <Field label="CNPJ (opcional)" htmlFor="cnpj" errors={state.fieldErrors?.cnpj}>
            <Input id="cnpj" name="cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" />
          </Field>
          <SubmitButton className="w-full">Criar empresa</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
