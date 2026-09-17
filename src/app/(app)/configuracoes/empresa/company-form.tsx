"use client";

import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { formatCnpj } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { updateTenantAction } from "./actions";

export function CompanyForm({ tenant }: { tenant: Tables<"tenants"> }) {
  const [state, formAction] = useActionState(updateTenantAction, initialActionState);

  return (
    <form action={formAction} className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Identificação</CardTitle>
          <CardDescription>Nome e CNPJ aparecem nos relatórios exportados.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da empresa" htmlFor="name" errors={state.fieldErrors?.name}>
            <Input id="name" name="name" defaultValue={tenant.name} required />
          </Field>
          <Field label="CNPJ" htmlFor="cnpj" errors={state.fieldErrors?.cnpj}>
            <Input id="cnpj" name="cnpj" defaultValue={formatCnpj(tenant.cnpj)} placeholder="00.000.000/0000-00" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parâmetros de cálculo</CardTitle>
          <CardDescription>
            A jornada padrão é usada para calcular o custo hora dos colaboradores e a utilização da equipe.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Jornada padrão mensal (horas)"
            htmlFor="monthlyHours"
            hint="Ex.: 168 horas por mês."
            errors={state.fieldErrors?.monthlyHours}
          >
            <Input
              id="monthlyHours"
              name="monthlyHours"
              inputMode="decimal"
              defaultValue={Number(tenant.monthly_hours).toLocaleString("pt-BR")}
              required
            />
          </Field>
          <Field
            label="Tolerância da faixa de atenção (p.p.)"
            htmlFor="marginAttentionTolerance"
            hint="🟢 margem ≥ meta · 🟡 abaixo da meta até esta tolerância · 🔴 abaixo disso ou prejuízo."
            errors={state.fieldErrors?.marginAttentionTolerance}
          >
            <Input
              id="marginAttentionTolerance"
              name="marginAttentionTolerance"
              inputMode="decimal"
              defaultValue={Number(tenant.margin_attention_tolerance).toLocaleString("pt-BR")}
              required
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <SubmitButton>Salvar alterações</SubmitButton>
        <FormAlert state={state} />
      </div>
    </form>
  );
}
