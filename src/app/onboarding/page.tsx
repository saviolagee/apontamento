import { redirect } from "next/navigation";
import { getAppContext, getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
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

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <OnboardingForm email={user.email ?? ""} />
    </div>
  );
}
