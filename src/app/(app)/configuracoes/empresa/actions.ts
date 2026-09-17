"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { translateError } from "@/lib/auth/errors";
import { parseForm, type ActionState } from "@/lib/actions";
import { tenantSettingsSchema } from "@/lib/validation/schemas";

export async function updateTenantAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenant } = await requireRole(["admin"]);
  const parsed = parseForm(tenantSettingsSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      name: parsed.data.name,
      cnpj: parsed.data.cnpj,
      monthly_hours: parsed.data.monthlyHours,
      margin_attention_tolerance: parsed.data.marginAttentionTolerance,
    })
    .eq("id", tenant.id);

  if (error) return { error: translateError(error) };

  revalidatePath("/", "layout");
  return { success: "Configurações salvas." };
}
