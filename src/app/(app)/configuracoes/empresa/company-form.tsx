"use client";

import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeCheckbox } from "@/components/native-select";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { formatCnpj } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { updateTenantAction, updateTenantDomainAction } from "./actions";

export function DomainForm({ tenant }: { tenant: Tables<"tenants"> }) {
  const [state, formAction] = useActionState(updateTenantDomainAction, initialActionState);

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      {!tenant.email_domain ? (
        <p className="rounded-lg border border-[--viz-warning] bg-[color-mix(in_oklch,var(--viz-warning),transparent_88%)] px-3 py-2 text-sm">
          Sua empresa ainda não tem domínio definido. Sem ele, ninguém entra automaticamente — só por convite.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field
          label="Domínio corporativo"
          htmlFor="emailDomain"
          hint="Pode colar um e-mail da empresa: guardamos só o domínio."
          errors={state.fieldErrors?.emailDomain}
        >
          <Input
            id="emailDomain"
            name="emailDomain"
            defaultValue={tenant.email_domain ?? ""}
            placeholder="suaempresa.com.br"
            required
          />
        </Field>
        <SubmitButton>Salvar domínio</SubmitButton>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <NativeCheckbox name="autoJoinDomain" defaultChecked={tenant.auto_join_domain} className="mt-0.5" />
        <span>
          Entrada automática
          <span className="block text-xs text-muted-foreground">
            Quem se cadastrar com um e-mail @{tenant.email_domain || "suaempresa.com.br"} entra como colaborador. Com a
            opção desligada, só entra quem receber convite.
          </span>
        </span>
      </label>
    </form>
  );
}

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
            label="Tolerância da faixa de atenção (pontos percentuais)"
            htmlFor="marginAttentionTolerance"
            hint="Quantos pontos a margem real pode ficar abaixo da meta antes de virar crítico. Ex.: meta de 30% com tolerância de 10 vira 🟡 Atenção até 20% e 🔴 Crítico abaixo disso. 🟢 Saudável é margem igual ou acima da meta."
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
