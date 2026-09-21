"use client";

import { useActionState } from "react";
import { LinkIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyLink } from "@/components/copy-link";
import { FormAlert, SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { ROLE_LABELS } from "@/lib/auth/session.shared";
import { formatDateTime } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { accessLinkAction, cancelInvitationAction } from "./actions";

function Invitation({ invitation }: { invitation: Tables<"invitations"> }) {
  const [cancelState, cancelAction] = useActionState(cancelInvitationAction, initialActionState);
  const [linkState, linkAction] = useActionState(accessLinkAction, initialActionState);

  return (
    <div className="grid gap-2 rounded-lg border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid">
          <span className="font-medium">{invitation.full_name}</span>
          <span className="text-xs text-muted-foreground">
            {invitation.email} · enviado em {formatDateTime(invitation.created_at)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{ROLE_LABELS[invitation.role]}</Badge>
          <form action={linkAction}>
            <input type="hidden" name="email" value={invitation.email} />
            <SubmitButton variant="outline" size="sm">
              <LinkIcon />
              Gerar link
            </SubmitButton>
          </form>
          <form action={cancelAction}>
            <input type="hidden" name="invitationId" value={invitation.id} />
            <SubmitButton variant="ghost" size="sm">
              Cancelar
            </SubmitButton>
          </form>
        </div>
      </div>

      {cancelState.error ? <p className="text-sm text-destructive">{cancelState.error}</p> : null}
      {linkState.error ? <FormAlert state={linkState} /> : null}
      {linkState.link ? <CopyLink link={linkState.link} /> : null}
    </div>
  );
}

export function PendingInvitations({ invitations }: { invitations: Tables<"invitations">[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Convites pendentes</CardTitle>
        <CardDescription>
          O convite é aceito quando a pessoa abre o link e cria a senha. Como o e-mail automático do Supabase é
          limitado, use <strong>Gerar link</strong> e mande por WhatsApp ou Teams.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {invitations.map((invitation) => (
          <Invitation key={invitation.id} invitation={invitation} />
        ))}
      </CardContent>
    </Card>
  );
}
