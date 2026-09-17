import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { InviteForm } from "./invite-form";
import { MembersTable } from "./members-table";
import { PendingInvitations } from "./pending-invitations";

export const metadata = { title: "Usuários e acessos | Apontamento" };

export default async function UsersPage() {
  const { profile } = await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("invitations").select("*").is("accepted_at", null).order("created_at", { ascending: false }),
  ]);

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuários e acessos</h1>
        <p className="text-muted-foreground">
          Convide sua equipe e defina o que cada perfil enxerga. Colaboradores nunca veem valores de contrato, custos ou
          salários.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Convidar pessoa</CardTitle>
          <CardDescription>
            A pessoa recebe um e-mail para criar a senha e já entra na empresa com o perfil escolhido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>

      {invitations?.length ? <PendingInvitations invitations={invitations as Tables<"invitations">[]} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Membros</CardTitle>
          <CardDescription>Perfil de acesso, permissão de ver custos individuais e status.</CardDescription>
        </CardHeader>
        <CardContent>
          <MembersTable members={(members ?? []) as Tables<"profiles">[]} currentUserId={profile.id} />
        </CardContent>
      </Card>
    </div>
  );
}
