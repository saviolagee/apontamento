"use client";

import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/form";
import { initialActionState } from "@/lib/actions";
import { ROLE_LABELS } from "@/lib/auth/session.shared";
import { formatDateTime } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import { cancelInvitationAction } from "./actions";

export function PendingInvitations({ invitations }: { invitations: Tables<"invitations">[] }) {
  const [state, formAction] = useActionState(cancelInvitationAction, initialActionState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Convites pendentes</CardTitle>
        <CardDescription>
          O convite é aceito automaticamente quando a pessoa se cadastra com o mesmo e-mail.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
          >
            <div className="grid">
              <span className="font-medium">{invitation.full_name}</span>
              <span className="text-xs text-muted-foreground">
                {invitation.email} · enviado em {formatDateTime(invitation.created_at)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{ROLE_LABELS[invitation.role]}</Badge>
              <form action={formAction}>
                <input type="hidden" name="invitationId" value={invitation.id} />
                <SubmitButton variant="ghost" size="sm">
                  Cancelar
                </SubmitButton>
              </form>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
