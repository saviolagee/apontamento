import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/components/sign-out-button";
import { getAppContext, getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { emailDomain, isPublicEmailDomain } from "@/lib/email-domain";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Criar empresa | Apontamento" };

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const ctx = await getAppContext();
  if (ctx) redirect("/inicio");

  // Convite criado depois do cadastro: vincula agora.
  const supabase = await createClient();
  const { data: tenantId } = await supabase.rpc("accept_pending_invitation");
  if (tenantId) redirect("/inicio");

  const domain = emailDomain(user.email);

  // Empresa é identificada pelo domínio corporativo: e-mail pessoal não serve
  if (!domain || isPublicEmailDomain(domain)) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Use seu e-mail corporativo</CardTitle>
            <CardDescription>
              Você entrou com <span className="font-medium text-foreground">{user.email}</span>. A empresa é
              identificada pelo domínio do e-mail (ex.: @suaempresa.com.br) — é assim que sua equipe entra
              automaticamente na empresa certa ao se cadastrar.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Saia e crie a conta com seu e-mail da empresa. Se alguém da sua equipe já criou a empresa, peça um
              convite: aí qualquer e-mail funciona.
            </p>
            <SignOutButton variant="outline" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <OnboardingForm email={user.email ?? ""} domain={domain} />
    </div>
  );
}
