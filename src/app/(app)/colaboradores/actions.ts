"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { translateError } from "@/lib/auth/errors";
import { createAccessLink } from "@/lib/server/access-link";
import { getOrigin } from "@/lib/server/origin";
import { parseForm, type ActionState } from "@/lib/actions";
import { employeeCostSchema, employeeSchema, roleSchema } from "@/lib/validation/schemas";

export async function createEmployeeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenant } = await requireRole(["admin", "gestor"]);
  const parsed = parseForm(employeeSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .insert({
      tenant_id: tenant.id,
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      job_title: parsed.data.jobTitle,
      monthly_hours: parsed.data.monthlyHours,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Já existe um colaborador com esse e-mail." };
    return { error: translateError(error) };
  }

  revalidatePath("/colaboradores");
  redirect(`/colaboradores/${data.id}`);
}

export async function updateEmployeeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin", "gestor"]);
  const parsed = parseForm(employeeSchema.extend({ id: z.uuid() }), formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      job_title: parsed.data.jobTitle,
      monthly_hours: parsed.data.monthlyHours,
      active: parsed.data.active,
    })
    .eq("id", parsed.data.id);
  if (error) {
    if (error.code === "23505") return { error: "Já existe um colaborador com esse e-mail." };
    return { error: translateError(error) };
  }

  revalidatePath(`/colaboradores/${parsed.data.id}`);
  revalidatePath("/colaboradores");
  return { success: "Dados salvos." };
}

export async function setEmployeeAreasAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenant } = await requireRole(["admin", "gestor"]);
  const employeeId = z.uuid().safeParse(formData.get("employeeId"));
  if (!employeeId.success) return { error: "Colaborador inválido." };

  const areaIds = formData.getAll("areaIds").filter((v): v is string => typeof v === "string");

  const supabase = await createClient();
  const { error: delError } = await supabase.from("employee_areas").delete().eq("employee_id", employeeId.data);
  if (delError) return { error: translateError(delError) };

  if (areaIds.length) {
    const { error } = await supabase
      .from("employee_areas")
      .insert(areaIds.map((areaId) => ({ tenant_id: tenant.id, employee_id: employeeId.data, area_id: areaId })));
    if (error) return { error: translateError(error) };
  }

  revalidatePath(`/colaboradores/${employeeId.data}`);
  return { success: "Áreas atualizadas." };
}

export async function setEmployeeCostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const parsed = parseForm(employeeCostSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_employee_cost", {
    p_employee_id: parsed.data.employeeId,
    p_monthly_salary: parsed.data.monthlySalary,
    p_charges_percent: parsed.data.chargesPercent,
    p_charges_amount: parsed.data.chargesAmount,
    p_benefits: parsed.data.benefits,
    p_monthly_hours: parsed.data.monthlyHours,
    p_valid_from: parsed.data.validFrom,
  });
  if (error) return { error: translateError(error) };

  revalidatePath(`/colaboradores/${parsed.data.employeeId}`);
  return { success: "Custo registrado com a nova vigência." };
}

const grantAccessSchema = z.object({
  employeeId: z.uuid(),
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  fullName: z.string().trim().min(2),
  role: roleSchema,
});

/** Convida o colaborador para acessar o sistema, já vinculado ao cadastro. */
export async function grantAccessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenant } = await requireRole(["admin"]);
  const parsed = parseForm(grantAccessSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.from("invitations").insert({
    tenant_id: tenant.id,
    email: parsed.data.email,
    full_name: parsed.data.fullName,
    role: parsed.data.role,
    employee_id: parsed.data.employeeId,
  });
  if (error) {
    if (error.code === "23505") return { error: "Já existe um convite pendente para este e-mail." };
    return { error: translateError(error) };
  }

  revalidatePath(`/colaboradores/${parsed.data.employeeId}`);

  // O e-mail automático é só uma tentativa; o link copiável é o que garante.
  let emailEnviado = false;
  try {
    const admin = createAdminClient();
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email);
    emailEnviado = !inviteError;
  } catch {
    emailEnviado = false;
  }

  const origin = await getOrigin();
  const gerado = await createAccessLink(parsed.data.email, origin);

  if ("error" in gerado) {
    return {
      success: emailEnviado
        ? `Convite enviado para ${parsed.data.email}.`
        : `Convite registrado, mas não foi possível enviar o e-mail nem gerar o link (${gerado.error}).`,
    };
  }

  return {
    success: emailEnviado
      ? `Convite enviado para ${parsed.data.email}. Se o e-mail não chegar, use o link abaixo.`
      : `Convite criado para ${parsed.data.email}. O e-mail automático não saiu — envie o link abaixo.`,
    link: gerado.link,
  };
}
