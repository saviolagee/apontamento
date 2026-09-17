"use client";

import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { resetPasswordAction } from "./actions";

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState(resetPasswordAction, initialActionState);

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Nova senha</CardTitle>
          <CardDescription>Defina a senha que você usará para entrar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-4">
            <FormAlert state={state} />
            <Field label="Nova senha" htmlFor="password" hint="Mínimo de 8 caracteres." errors={state.fieldErrors?.password}>
              <Input id="password" name="password" type="password" autoComplete="new-password" required />
            </Field>
            <Field label="Confirmar senha" htmlFor="confirmPassword" errors={state.fieldErrors?.confirmPassword}>
              <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
            </Field>
            <SubmitButton className="w-full">Salvar senha</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
