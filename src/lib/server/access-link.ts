import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { translateError } from "@/lib/auth/errors";

/**
 * Gera um link de primeiro acesso sem depender de e-mail.
 *
 * O e-mail nativo do Supabase é limitado (poucos envios por hora) e nem sempre
 * chega, então o administrador pode copiar este link e mandar por onde quiser.
 * Quem abrir cria a senha e já entra na empresa.
 */
export async function createAccessLink(
  email: string,
  origin: string,
): Promise<{ link: string } | { error: string }> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Configure a SUPABASE_SERVICE_ROLE_KEY para gerar links de acesso." };
  }

  const options = { redirectTo: `${origin}/` };

  // "invite" cria a conta; se ela já existir, "recovery" serve ao mesmo fim
  const convite = await admin.auth.admin.generateLink({ type: "invite", email, options });
  if (!convite.error && convite.data.properties?.action_link) {
    return { link: convite.data.properties.action_link };
  }

  const recuperacao = await admin.auth.admin.generateLink({ type: "recovery", email, options });
  if (!recuperacao.error && recuperacao.data.properties?.action_link) {
    return { link: recuperacao.data.properties.action_link };
  }

  return { error: translateError(recuperacao.error ?? convite.error) };
}
