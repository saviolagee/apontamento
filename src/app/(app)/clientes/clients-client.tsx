"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeCheckbox } from "@/components/native-select";
import { EmptyState } from "@/components/page-header";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { formatCnpj } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { createClientAction, setClientAreasAction, updateClientAction } from "./actions";

export function NewClientForm() {
  const [state, formAction] = useActionState(createClientAction, initialActionState);

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Razão social" htmlFor="legalName" errors={state.fieldErrors?.legalName}>
          <Input id="legalName" name="legalName" required />
        </Field>
        <Field label="Nome fantasia" htmlFor="tradeName" errors={state.fieldErrors?.tradeName}>
          <Input id="tradeName" name="tradeName" />
        </Field>
        <Field label="CNPJ" htmlFor="cnpj" errors={state.fieldErrors?.cnpj}>
          <Input id="cnpj" name="cnpj" placeholder="00.000.000/0000-00" />
        </Field>
      </div>
      <div>
        <SubmitButton>Cadastrar cliente</SubmitButton>
      </div>
    </form>
  );
}

export function ClientDetailsForm({ client }: { client: Tables<"clients"> }) {
  const [state, formAction] = useActionState(updateClientAction, initialActionState);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="id" value={client.id} />
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Razão social" htmlFor="legalName" errors={state.fieldErrors?.legalName}>
          <Input id="legalName" name="legalName" defaultValue={client.legal_name} required />
        </Field>
        <Field label="Nome fantasia" htmlFor="tradeName" errors={state.fieldErrors?.tradeName}>
          <Input id="tradeName" name="tradeName" defaultValue={client.trade_name ?? ""} />
        </Field>
        <Field label="CNPJ" htmlFor="cnpj" errors={state.fieldErrors?.cnpj}>
          <Input id="cnpj" name="cnpj" defaultValue={formatCnpj(client.cnpj)} />
        </Field>
        <Field label="Contato" htmlFor="contactName" errors={state.fieldErrors?.contactName}>
          <Input id="contactName" name="contactName" defaultValue={client.contact_name ?? ""} />
        </Field>
        <Field label="E-mail" htmlFor="email" errors={state.fieldErrors?.email}>
          <Input id="email" name="email" type="email" defaultValue={client.email ?? ""} />
        </Field>
        <Field label="Telefone" htmlFor="phone" errors={state.fieldErrors?.phone}>
          <Input id="phone" name="phone" defaultValue={client.phone ?? ""} />
        </Field>
      </div>
      <Field label="Observações" htmlFor="notes" errors={state.fieldErrors?.notes}>
        <Textarea id="notes" name="notes" defaultValue={client.notes ?? ""} rows={3} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <NativeCheckbox name="active" defaultChecked={client.active} />
        Cliente ativo
      </label>
      <div>
        <SubmitButton>Salvar cliente</SubmitButton>
      </div>
    </form>
  );
}

export function ClientAreasForm({
  clientId,
  areas,
  selected,
}: {
  clientId: string;
  areas: Pick<Tables<"areas">, "id" | "name" | "active">[];
  selected: string[];
}) {
  const [state, formAction] = useActionState(setClientAreasAction, initialActionState);

  if (!areas.length) return <EmptyState>Cadastre áreas de atuação para vincular.</EmptyState>;

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      <FormAlert state={state} />
      <div className="grid gap-2 sm:grid-cols-2">
        {areas
          .filter((area) => area.active || selected.includes(area.id))
          .map((area) => (
            <label key={area.id} className="flex items-center gap-2 text-sm">
              <NativeCheckbox name="areaIds" value={area.id} defaultChecked={selected.includes(area.id)} />
              {area.name}
              {area.active ? "" : " (inativa)"}
            </label>
          ))}
      </div>
      <div>
        <SubmitButton variant="outline">Salvar áreas</SubmitButton>
      </div>
    </form>
  );
}
