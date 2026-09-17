"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { translateError } from "@/lib/auth/errors";
import { parseForm, type ActionState } from "@/lib/actions";
import { inviteSchema, updateMemberSchema } from "@/lib/validation/schemas";

export async function inviteMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenant } = await requireRole(["admin"]);
  const parsed = parseForm(inviteSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  // O RLS garante que só admin da própria empresa consegue inserir.
  const { error } = await supabase.from("invitations").insert({
    tenant_id: tenant.id,
    email: parsed.data.email,
    full_name: parsed.data.fullName,
    role: parsed.data.role,
    can_view_costs: parsed.data.role === "gestor" && parsed.data.canViewCosts,
  });
  if (error) {
    if (error.code === "23505") return { error: "Já existe um convite pendente para este e-mail." };
    return { error: translateError(error) };
  }

  revalidatePath("/configuracoes/usuarios");

  // Envio do e-mail de convite (Auth Admin). Se falhar, o convite continua
  // válido: a pessoa se cadastra com o mesmo e-mail e entra na empresa.
  try {
    const admin = createAdminClient();
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email);
    if (inviteError) {
      return {
        success: `Convite registrado para ${parsed.data.email}. Não foi possível enviar o e-mail automático (${translateError(inviteError)}); peça para a pessoa se cadastrar com este e-mail.`,
      };
    }
  } catch {
    return {
      success: `Convite registrado para ${parsed.data.email}. Configure SUPABASE_SERVICE_ROLE_KEY para enviar o e-mail automaticamente.`,
    };
  }

  return { success: `Convite enviado para ${parsed.data.email}.` };
}

export async function cancelInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const parsed = parseForm(z.object({ invitationId: z.uuid() }), formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.from("invitations").delete().eq("id", parsed.data.invitationId);
  if (error) return { error: translateError(error) };

  revalidatePath("/configuracoes/usuarios");
  return { success: "Convite cancelado." };
}

export async function updateMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const parsed = parseForm(updateMemberSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_member", {
    p_profile_id: parsed.data.profileId,
    p_role: parsed.data.role,
    p_can_view_costs: parsed.data.canViewCosts,
    p_active: parsed.data.active,
  });
  if (error) return { error: translateError(error) };

  revalidatePath("/configuracoes/usuarios");
  return { success: "Acesso atualizado." };
}
