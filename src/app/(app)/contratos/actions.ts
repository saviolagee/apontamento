"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { translateError } from "@/lib/auth/errors";
import { parseForm, type ActionState } from "@/lib/actions";
import { contractSchema, expenseSchema } from "@/lib/validation/schemas";

function contractPayload(data: z.output<typeof contractSchema>) {
  return {
    name: data.name,
    description: data.description,
    amount: data.amount,
    periodicity: data.periodicity,
    start_date: data.startDate,
    end_date: data.endDate,
    desired_margin: data.desiredMargin,
    tax_rate: data.taxRate,
    expected_hours: data.expectedHours,
    status: data.status,
  };
}

export async function createContractAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenant } = await requireRole(["admin", "gestor"]);
  const parsed = parseForm(contractSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .insert({ tenant_id: tenant.id, client_id: parsed.data.clientId, ...contractPayload(parsed.data) })
    .select("id")
    .single();

  if (error) return { error: translateError(error) };

  revalidatePath(`/clientes/${parsed.data.clientId}`);
  redirect(`/contratos/${data.id}`);
}

export async function updateContractAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin", "gestor"]);
  const parsed = parseForm(contractSchema.safeExtend({ id: z.uuid() }), formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.from("contracts").update(contractPayload(parsed.data)).eq("id", parsed.data.id);
  if (error) return { error: translateError(error) };

  revalidatePath(`/contratos/${parsed.data.id}`);
  revalidatePath(`/clientes/${parsed.data.clientId}`);
  return { success: "Contrato salvo." };
}

/** Áreas, atividades e colaboradores alocados. */
export async function setContractLinksAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenant } = await requireRole(["admin", "gestor"]);
  const contractId = z.uuid().safeParse(formData.get("contractId"));
  if (!contractId.success) return { error: "Contrato inválido." };

  const ids = (name: string) => formData.getAll(name).filter((v): v is string => typeof v === "string");
  const areaIds = ids("areaIds");
  const activityIds = ids("activityIds");
  const employeeIds = ids("employeeIds");

  const supabase = await createClient();
  const contract = contractId.data;

  const [a, b, c] = await Promise.all([
    supabase.from("contract_areas").delete().eq("contract_id", contract),
    supabase.from("contract_activities").delete().eq("contract_id", contract),
    supabase.from("contract_members").delete().eq("contract_id", contract),
  ]);
  const delError = a.error ?? b.error ?? c.error;
  if (delError) return { error: translateError(delError) };

  const inserts = await Promise.all([
    areaIds.length
      ? supabase
          .from("contract_areas")
          .insert(areaIds.map((area_id) => ({ tenant_id: tenant.id, contract_id: contract, area_id })))
      : Promise.resolve({ error: null }),
    activityIds.length
      ? supabase
          .from("contract_activities")
          .insert(activityIds.map((activity_id) => ({ tenant_id: tenant.id, contract_id: contract, activity_id })))
      : Promise.resolve({ error: null }),
    employeeIds.length
      ? supabase
          .from("contract_members")
          .insert(employeeIds.map((employee_id) => ({ tenant_id: tenant.id, contract_id: contract, employee_id })))
      : Promise.resolve({ error: null }),
  ]);
  const insError = inserts.find((r) => r.error)?.error;
  if (insError) return { error: translateError(insError) };

  revalidatePath(`/contratos/${contract}`);
  return { success: "Vínculos atualizados." };
}

export async function createExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenant } = await requireRole(["admin", "gestor"]);
  const parsed = parseForm(expenseSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.from("contract_expenses").insert({
    tenant_id: tenant.id,
    contract_id: parsed.data.contractId,
    description: parsed.data.description,
    category: parsed.data.category,
    amount: parsed.data.amount,
    expense_date: parsed.data.expenseDate,
    recurrence: parsed.data.recurrence,
    end_date: parsed.data.endDate,
  });
  if (error) return { error: translateError(error) };

  revalidatePath(`/contratos/${parsed.data.contractId}`);
  return { success: "Gasto adicionado." };
}

export async function deleteExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin", "gestor"]);
  const parsed = parseForm(z.object({ id: z.uuid(), contractId: z.uuid() }), formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.from("contract_expenses").delete().eq("id", parsed.data.id);
  if (error) return { error: translateError(error) };

  revalidatePath(`/contratos/${parsed.data.contractId}`);
  return { success: "Gasto removido." };
}
