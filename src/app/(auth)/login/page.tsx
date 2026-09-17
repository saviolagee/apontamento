"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { loginAction } from "../actions";

function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialActionState);
  const next = useSearchParams().get("next") ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Acesse sua conta para apontar horas e acompanhar a rentabilidade.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="next" value={next} />
          <FormAlert state={state} />
          <Field label="E-mail" htmlFor="email" errors={state.fieldErrors?.email}>
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com.br" />
          </Field>
          <Field label="Senha" htmlFor="password" errors={state.fieldErrors?.password}>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton className="w-full">Entrar</SubmitButton>
          <div className="flex items-center justify-between text-sm">
            <Link href="/esqueci-senha" className="text-muted-foreground hover:underline">
              Esqueci minha senha
            </Link>
            <Link href="/cadastro" className="font-medium hover:underline">
              Criar conta
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
