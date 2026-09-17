"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeCheckbox, NativeSelect } from "@/components/native-select";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import type { AppRole } from "@/lib/database.types";
import { inviteMemberAction } from "./actions";

const ROLE_HINTS: Record<AppRole, string> = {
  admin: "Acesso total, inclusive custos e salários.",
  gestor: "Dashboards, rentabilidade, cadastros e aprovação de apontamentos.",
  colaborador: "Apenas os próprios apontamentos e análises pessoais.",
};

export function InviteForm() {
  const [state, formAction] = useActionState(inviteMemberAction, initialActionState);
  const [role, setRole] = useState<AppRole>("colaborador");

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nome" htmlFor="fullName" errors={state.fieldErrors?.fullName}>
          <Input id="fullName" name="fullName" required />
        </Field>
        <Field label="E-mail" htmlFor="email" errors={state.fieldErrors?.email}>
          <Input id="email" name="email" type="email" required />
        </Field>
        <Field label="Perfil de acesso" htmlFor="role" hint={ROLE_HINTS[role]} errors={state.fieldErrors?.role}>
          <NativeSelect id="role" name="role" value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
            <option value="colaborador">Colaborador</option>
            <option value="gestor">Gestor</option>
            <option value="admin">Administrador</option>
          </NativeSelect>
        </Field>
      </div>

      {role === "gestor" ? (
        <label className="flex items-center gap-2 text-sm">
          <NativeCheckbox name="canViewCosts" />
          Pode ver o custo individual dos colaboradores
        </label>
      ) : null}

      <div>
        <SubmitButton>Enviar convite</SubmitButton>
      </div>
    </form>
  );
}
