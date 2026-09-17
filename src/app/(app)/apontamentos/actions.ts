"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireContext, requireRole } from "@/lib/auth/session";
import { translateError } from "@/lib/auth/errors";
import { parseForm, type ActionState } from "@/lib/actions";
import { periodLockSchema, timeEntrySchema } from "@/lib/validation/schemas";
import { parseDurationToMinutes } from "@/lib/time";

function entryPayload(data: z.output<typeof timeEntrySchema>): { minutes: number } | { error: string } {
  if (data.startTime && data.endTime) {
    const [sh, sm] = data.startTime.split(":").map(Number);
    const [eh, em] = data.endTime.split(":").map(Number);
    const minutes = eh * 60 + em - (sh * 60 + sm);
    if (minutes <= 0) return { error: "A hora final precisa ser depois da inicial." };
    return { minutes };
  }
  const minutes = parseDurationToMinutes(data.duration);
  if (minutes === null || minutes <= 0) return { error: "Duração inválida. Use 1:30, 1,5 ou 90m." };
  if (minutes > 1440) return { error: "Duração maior que um dia." };
  return { minutes };
}

export async function createTimeEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { tenant, employeeId } = await requireContext();
  if (!employeeId) return { error: "Seu usuário não está vinculado a um colaborador. Fale com o administrador." };

  const parsed = parseForm(timeEntrySchema, formData);
  if (!parsed.ok) return parsed.state;

  const computed = entryPayload(parsed.data);
  if ("error" in computed) return { error: computed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("time_entries").insert({
    tenant_id: tenant.id,
    employee_id: employeeId,
    contract_id: parsed.data.contractId,
    activity_id: parsed.data.activityId,
    entry_date: parsed.data.entryDate,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
    minutes: computed.minutes,
    description: parsed.data.description,
  });
  if (error) return { error: translateError(error) };

  revalidatePath("/apontamentos");
  return { success: "Apontamento registrado." };
}

export async function updateTimeEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireContext();
  const parsed = parseForm(timeEntrySchema.safeExtend({ id: z.uuid() }), formData);
  if (!parsed.ok) return parsed.state;

  const computed = entryPayload(parsed.data);
  if ("error" in computed) return { error: computed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("time_entries")
    .update({
      contract_id: parsed.data.contractId,
      activity_id: parsed.data.activityId,
      entry_date: parsed.data.entryDate,
      start_time: parsed.data.startTime,
      end_time: parsed.data.endTime,
      minutes: computed.minutes,
      description: parsed.data.description,
    })
    .eq("id", parsed.data.id);
  if (error) return { error: translateError(error) };

  revalidatePath("/apontamentos");
  return { success: "Apontamento atualizado." };
}

export async function deleteTimeEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireContext();
  const parsed = parseForm(z.object({ id: z.uuid() }), formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.from("time_entries").delete().eq("id", parsed.data.id);
  if (error) return { error: translateError(error) };

  revalidatePath("/apontamentos");
  return { success: "Apontamento excluído." };
}

export async function reviewTimeEntriesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin", "gestor"]);
  const ids = formData.getAll("ids").filter((v): v is string => typeof v === "string");
  const status = formData.get("status");
  const comment = formData.get("comment");

  const parsed = z
    .object({
      ids: z.array(z.uuid()).min(1, "Selecione ao menos um apontamento."),
      status: z.enum(["aprovado", "rejeitado"]),
      comment: z
        .string()
        .trim()
        .max(500)
        .transform((v) => (v === "" ? null : v)),
    })
    .safeParse({ ids, status, comment: typeof comment === "string" ? comment : "" });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_time_entries", {
    p_ids: parsed.data.ids,
    p_status: parsed.data.status,
    p_comment: parsed.data.comment,
  });
  if (error) return { error: translateError(error) };

  revalidatePath("/aprovacoes");
  revalidatePath("/apontamentos");
  return {
    success: `${data} apontamento(s) ${parsed.data.status === "aprovado" ? "aprovado(s)" : "rejeitado(s)"}.`,
  };
}

export async function setPeriodLockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(["admin"]);
  const parsed = parseForm(periodLockSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_period_lock", { p_locked_through: parsed.data.lockedThrough });
  if (error) return { error: translateError(error) };

  revalidatePath("/", "layout");
  return {
    success: parsed.data.lockedThrough
      ? "Período fechado. Lançamentos até essa data ficam bloqueados."
      : "Bloqueio removido.",
  };
}
