import type { z } from "zod";

export type ActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[]>;
  /** Link de acesso gerado para entregar por fora do e-mail. */
  link?: string;
};

export const initialActionState: ActionState = {};

/** Valida um FormData com um schema Zod, devolvendo erros por campo. */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { ok: true; data: z.output<T> } | { ok: false; state: ActionState } {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;
    raw[key] = value;
  }
  // Checkboxes não enviados viram `false`
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, state: { error: "Verifique os campos destacados.", fieldErrors } };
}

export const checkbox = (formData: FormData, name: string) => formData.get(name) === "on" || formData.get(name) === "true";
