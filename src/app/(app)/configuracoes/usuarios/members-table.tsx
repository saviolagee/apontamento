"use client";

import { useActionState, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LinkIcon } from "lucide-react";
import { NativeCheckbox, NativeSelect } from "@/components/native-select";
import { CopyLink } from "@/components/copy-link";
import { FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import type { AppRole, Tables } from "@/lib/database.types";
import { accessLinkAction, updateMemberAction } from "./actions";

function MemberRow({ member, isCurrentUser }: { member: Tables<"profiles">; isCurrentUser: boolean }) {
  const [state, formAction] = useActionState(updateMemberAction, initialActionState);
  const [linkState, linkAction] = useActionState(accessLinkAction, initialActionState);
  const [role, setRole] = useState<AppRole>(member.role);

  return (
    <TableRow>
      <TableCell>
        <div className="grid">
          <span className="font-medium">
            {member.full_name}
            {isCurrentUser ? <span className="ml-1 text-xs text-muted-foreground">(você)</span> : null}
          </span>
          <span className="text-xs text-muted-foreground">{member.email}</span>
          {state.error || state.success ? (
            <div className="mt-2 max-w-md">
              <FormAlert state={state} />
            </div>
          ) : null}
        </div>
      </TableCell>
      <TableCell colSpan={4} className="p-0">
        <form action={formAction} className="flex flex-wrap items-center gap-4 px-3 py-2">
          <input type="hidden" name="profileId" value={member.id} />
          <NativeSelect
            aria-label={`Perfil de ${member.full_name}`}
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
            className="w-40"
          >
            <option value="colaborador">Colaborador</option>
            <option value="gestor">Gestor</option>
            <option value="admin">Administrador</option>
          </NativeSelect>

          <label className="flex items-center gap-2 text-sm">
            <NativeCheckbox
              name="canViewCosts"
              defaultChecked={member.can_view_costs}
              disabled={role !== "gestor"}
              title={role === "gestor" ? undefined : "Disponível apenas para gestores"}
            />
            <span className={role === "gestor" ? "" : "text-muted-foreground"}>Vê custos</span>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <NativeCheckbox name="active" defaultChecked={member.active} />
            Ativo
          </label>

          <SubmitButton size="sm" variant="outline">
            Salvar
          </SubmitButton>
        </form>

        {/* Serve para quem ainda não criou a senha e para quem a esqueceu */}
        <form action={linkAction} className="px-3 pb-2">
          <input type="hidden" name="email" value={member.email} />
          <SubmitButton size="xs" variant="ghost">
            <LinkIcon />
            Link de acesso
          </SubmitButton>
          {linkState.error ? <p className="mt-1 text-xs text-destructive">{linkState.error}</p> : null}
          {linkState.link ? (
            <div className="mt-2 max-w-xl">
              <CopyLink
                link={linkState.link}
                hint={`Mande para ${member.full_name} criar ou trocar a senha sem depender de e-mail.`}
              />
            </div>
          ) : null}
        </form>
      </TableCell>
    </TableRow>
  );
}

export function MembersTable({ members, currentUserId }: { members: Tables<"profiles">[]; currentUserId: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pessoa</TableHead>
          <TableHead colSpan={4}>Acesso</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <MemberRow key={member.id} member={member} isCurrentUser={member.id === currentUserId} />
        ))}
        {members.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              Nenhum membro ainda.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
