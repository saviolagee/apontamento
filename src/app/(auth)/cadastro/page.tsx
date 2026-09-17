"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { signupAction } from "../actions";

export default function SignupPage() {
  const [state, formAction] = useActionState(signupAction, initialActionState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>
          Use seu <span className="font-medium text-foreground">e-mail corporativo</span>: é ele que liga você à
          empresa certa. Se você foi convidado, use o mesmo e-mail do convite.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <FormAlert state={state} />
          <Field label="E-mail" htmlFor="email" errors={state.fieldErrors?.email}>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field
            label="Senha"
            htmlFor="password"
            hint="Mínimo de 8 caracteres."
            errors={state.fieldErrors?.password}
          >
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
          </Field>
          <Field label="Confirmar senha" htmlFor="confirmPassword" errors={state.fieldErrors?.confirmPassword}>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
          </Field>
          <SubmitButton className="w-full">Criar conta</SubmitButton>
          <p className="text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link href="/login" className="font-medium text-foreground hover:underline">
              Entrar
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
