import { z } from "zod";
import { onlyDigits } from "@/lib/format";
import { isValidCnpj } from "./cnpj";

export const emailSchema = z.email("Informe um e-mail válido.").trim().toLowerCase();

export const passwordSchema = z.string().min(8, "A senha deve ter pelo menos 8 caracteres.");

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Informe pelo menos 2 caracteres.")
  .max(150, "Máximo de 150 caracteres.");

/** CNPJ opcional: vazio → null; preenchido → só dígitos e válido. */
export const optionalCnpjSchema = z
  .string()
  .trim()
  .transform((v) => onlyDigits(v))
  .refine((v) => v === "" || isValidCnpj(v), "CNPJ inválido.")
  .transform((v) => (v === "" ? null : v));

/** Número em formato brasileiro ("1.234,56") ou internacional. */
export const decimalSchema = z
  .string()
  .trim()
  .min(1, "Campo obrigatório.")
  .transform((v, ctx) => {
    const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
    const n = Number(normalized);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Número inválido." });
      return z.NEVER;
    }
    return n;
  });

export const roleSchema = z.enum(["admin", "gestor", "colaborador"]);

/** Checkbox de formulário: ausente = false, "on"/"true" = true. */
export const checkboxSchema = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Informe a senha.") });

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "As senhas não conferem.",
    path: ["confirmPassword"],
  });

export const createTenantSchema = z.object({
  companyName: nameSchema,
  cnpj: optionalCnpjSchema,
  fullName: nameSchema,
});

export const tenantSettingsSchema = z.object({
  name: nameSchema,
  cnpj: optionalCnpjSchema,
  monthlyHours: decimalSchema.pipe(z.number().gt(0, "Deve ser maior que zero.").max(744, "Máximo de 744 horas.")),
  marginAttentionTolerance: decimalSchema.pipe(
    z.number().min(0, "Não pode ser negativo.").max(100, "Máximo de 100 p.p."),
  ),
});

export const inviteSchema = z.object({
  email: emailSchema,
  fullName: nameSchema,
  role: roleSchema,
  canViewCosts: checkboxSchema,
});

export const updateMemberSchema = z.object({
  profileId: z.uuid(),
  role: roleSchema,
  canViewCosts: checkboxSchema,
  active: checkboxSchema,
});
