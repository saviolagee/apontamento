"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { translateError } from "@/lib/auth/errors";
import { parseForm, type ActionState } from "@/lib/actions";
import { createTenantSchema } from "@/lib/validation/schemas";

export async function createTenantAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(createTenantSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.companyName,
    p_cnpj: parsed.data.cnpj,
    p_full_name: parsed.data.fullName,
  });
  if (error) return { error: translateError(error) };

  revalidatePath("/", "layout");
  redirect("/inicio");
}
