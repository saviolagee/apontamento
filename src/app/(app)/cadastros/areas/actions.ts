"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { translateError } from "@/lib/auth/errors";
import { parseForm, type ActionState } from "@/lib/actions";
import { areaSchema } from "@/lib/validation/schemas";

export async function createAreaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenant } = await requireRole(["admin", "gestor"]);
  const parsed = parseForm(areaSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.from("areas").insert({
    tenant_id: tenant.id,
    name: parsed.data.name,
    description: parsed.data.description,
    active: true,
  });
  if (error) {
    if (error.code === "23505") return { error: "Já existe uma área com esse nome." };
    return { error: translateError(error) };
  }

  revalidatePath("/cadastros/areas");
  return { success: "Área criada." };
}

export async function updateAreaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin", "gestor"]);
  const parsed = parseForm(areaSchema.extend({ id: z.uuid() }), formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase
    .from("areas")
    .update({ name: parsed.data.name, description: parsed.data.description, active: parsed.data.active })
    .eq("id", parsed.data.id);
  if (error) {
    if (error.code === "23505") return { error: "Já existe uma área com esse nome." };
    return { error: translateError(error) };
  }

  revalidatePath("/cadastros/areas");
  return { success: "Área atualizada." };
}
