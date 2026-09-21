"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { resetPasswordAction } from "./actions";

function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, initialActionState);
  // Quem chega por convite ainda não tem senha: o texto muda para não confundir
  const convite = useSearchParams().get("convite") === "1";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{convite ? "Bem-vindo! Crie sua senha" : "Nova senha"}</CardTitle>
        <CardDescription>
          {convite
            ? "Seu acesso já está liberado. Defina uma senha para entrar a partir de agora."
            : "Defina a senha que você usará para entrar."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <FormAlert state={state} />
          <Field label="Senha" htmlFor="password" hint="Mínimo de 8 caracteres." errors={state.fieldErrors?.password}>
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
          </Field>
          <Field label="Confirmar senha" htmlFor="confirmPassword" errors={state.fieldErrors?.confirmPassword}>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
          </Field>
          <SubmitButton className="w-full">{convite ? "Criar senha e entrar" : "Salvar senha"}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
