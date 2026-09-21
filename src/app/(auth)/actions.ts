"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/server/origin";
import { isExistingAccount } from "@/lib/auth/signup";
import { translateError } from "@/lib/auth/errors";
import { parseForm, type ActionState } from "@/lib/actions";
import { emailSchema, loginSchema, signupSchema } from "@/lib/validation/schemas";

/** Evita open redirect: só caminhos internos. */
function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/inicio";
}


export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: translateError(error) };

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(signupSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const origin = await getOrigin();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/onboarding` },
  });
  if (error) return { error: translateError(error) };

  // Confirmação de e-mail desativada no projeto: já entra logado.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/onboarding");
  }

  // Para não revelar quem tem conta, o Supabase devolve "sucesso" com a lista
  // de identidades vazia quando o e-mail já existe — e não envia e-mail algum.
  // Antes de avisar que enviamos, conferimos.
  if (isExistingAccount(data.user)) {
    return {
      error:
        "Já existe uma conta com este e-mail. Se o administrador te convidou, abra o link do convite; se você já tem senha, entre normalmente ou use \"Esqueci minha senha\".",
    };
  }

  return { success: "Conta criada! Enviamos um link de confirmação para o seu e-mail." };
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(emailSchema.transform((email) => ({ email })), formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const origin = await getOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirm?next=/redefinir-senha`,
  });
  if (error) return { error: translateError(error) };
  return { success: "Se existir uma conta com este e-mail, enviamos o link para redefinir a senha." };
}
