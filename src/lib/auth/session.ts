import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Tables } from "@/lib/database.types";

export type AppContext = {
  user: User;
  profile: Tables<"profiles">;
  tenant: Tables<"tenants">;
  /** Cadastro de colaborador vinculado ao login (quem aponta horas). */
  employeeId: string | null;
};

export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Contexto completo do usuário; `null` se ainda não pertence a uma empresa. */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const [{ data }, { data: employee }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*, tenants(*)")
      .eq("id", user.id)
      .maybeSingle<Tables<"profiles"> & { tenants: Tables<"tenants"> }>(),
    supabase.from("employees").select("id").eq("profile_id", user.id).maybeSingle(),
  ]);

  if (!data || !data.tenants) return null;
  const { tenants, ...profile } = data;
  return { user, profile, tenant: tenants, employeeId: employee?.id ?? null };
});

/** Exige usuário autenticado e vinculado a uma empresa ativa. */
export async function requireContext(): Promise<AppContext> {
  const user = await getUser();
  if (!user) redirect("/login");
  const ctx = await getAppContext();
  if (!ctx) redirect("/onboarding");
  if (!ctx.profile.active) redirect("/acesso-suspenso");
  return ctx;
}

export async function requireRole(roles: AppRole[]): Promise<AppContext> {
  const ctx = await requireContext();
  if (!roles.includes(ctx.profile.role)) redirect("/inicio");
  return ctx;
}

export { ROLE_LABELS, isManager } from "./session.shared";
