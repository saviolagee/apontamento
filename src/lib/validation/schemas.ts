import { z } from "zod";
import { onlyDigits } from "@/lib/format";
import { isPublicEmailDomain, isValidDomain, normalizeDomain } from "@/lib/email-domain";
import { isValidCnpj } from "./cnpj";

/**
 * Campo que pode não existir no formulário (input escondido por uma opção,
 * checkbox desmarcado, etc). Em FormData "ausente" e "vazio" são a mesma
 * coisa, então tratamos assim antes de validar.
 */
const fromForm = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === undefined || value === null ? "" : value), schema);

export const emailSchema = z.email("Informe um e-mail válido.").trim().toLowerCase();

export const passwordSchema = z.string().min(8, "A senha deve ter pelo menos 8 caracteres.");

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Informe pelo menos 2 caracteres.")
  .max(150, "Máximo de 150 caracteres.");

/** CNPJ opcional: vazio → null; preenchido → só dígitos e válido. */
export const optionalCnpjSchema = fromForm(
  z
    .string()
    .trim()
    .transform((v) => onlyDigits(v))
    .refine((v) => v === "" || isValidCnpj(v), "CNPJ inválido.")
    .transform((v) => (v === "" ? null : v)),
);

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

export const tenantDomainSchema = z.object({
  emailDomain: fromForm(
    z
      .string()
      .trim()
      .min(1, "Informe o domínio corporativo.")
      .transform((v) => normalizeDomain(v))
      .refine((v) => isValidDomain(v), "Domínio inválido. Use o formato suaempresa.com.br.")
      .refine((v) => !isPublicEmailDomain(v), "Use um domínio corporativo, não um provedor de e-mail pessoal."),
  ),
  autoJoinDomain: checkboxSchema,
});

export const inviteSchema = z.object({
  email: emailSchema,
  fullName: nameSchema,
  role: roleSchema,
  canViewCosts: checkboxSchema,
});

/** Campo de texto opcional: vazio vira null. */
export const optionalText = (max = 150) =>
  fromForm(
    z
      .string()
      .trim()
      .max(max, `Máximo de ${max} caracteres.`)
      .transform((v) => (v === "" ? null : v)),
  );

export const optionalEmailSchema = fromForm(
  z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Informe um e-mail válido."),
);

/** Número opcional (ex.: horas do colaborador quando difere do padrão). */
export const optionalDecimalSchema = fromForm(
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
      const n = Number(normalized);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: "custom", message: "Número inválido." });
        return z.NEVER;
      }
      return n;
    }),
);

export const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.");

export const areaSchema = z.object({
  name: nameSchema.max(100, "Máximo de 100 caracteres."),
  description: optionalText(500),
  active: checkboxSchema,
});

export const activitySchema = z.object({
  name: nameSchema.max(100, "Máximo de 100 caracteres."),
  areaId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || z.uuid().safeParse(v).success, "Área inválida."),
  billable: checkboxSchema,
  active: checkboxSchema,
});

export const employeeSchema = z.object({
  fullName: nameSchema,
  email: optionalEmailSchema,
  jobTitle: optionalText(100),
  monthlyHours: optionalDecimalSchema.refine(
    (v) => v === null || (v > 0 && v <= 744),
    "Informe entre 1 e 744 horas.",
  ),
  active: checkboxSchema,
});

export const employeeCostSchema = z.object({
  employeeId: z.uuid(),
  monthlySalary: decimalSchema.pipe(z.number().min(0, "Não pode ser negativo.")),
  chargesPercent: optionalDecimalSchema
    .transform((v) => v ?? 0)
    .pipe(z.number().min(0, "Não pode ser negativo.").max(300, "Máximo de 300%.")),
  chargesAmount: optionalDecimalSchema.transform((v) => v ?? 0).pipe(z.number().min(0, "Não pode ser negativo.")),
  benefits: optionalDecimalSchema.transform((v) => v ?? 0).pipe(z.number().min(0, "Não pode ser negativo.")),
  monthlyHours: decimalSchema.pipe(z.number().gt(0, "Deve ser maior que zero.").max(744, "Máximo de 744 horas.")),
  validFrom: dateSchema,
});

export const clientSchema = z.object({
  legalName: nameSchema,
  tradeName: optionalText(150),
  cnpj: optionalCnpjSchema,
  contactName: optionalText(150),
  email: optionalEmailSchema,
  phone: optionalText(30),
  notes: optionalText(1000),
  active: checkboxSchema,
});

export const periodicitySchema = z.enum(["mensal", "bimestral", "trimestral", "semestral", "anual", "projeto"]);
export const contractStatusSchema = z.enum(["ativo", "pausado", "encerrado"]);
export const expenseCategorySchema = z.enum(["deslocamento", "software", "terceirizado", "impostos", "outros"]);
export const expenseRecurrenceSchema = z.enum([
  "pontual",
  "mensal",
  "bimestral",
  "trimestral",
  "semestral",
  "anual",
]);

const optionalDateSchema = fromForm(
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Informe uma data válida."),
);

export const contractSchema = z
  .object({
    clientId: z.uuid(),
    name: nameSchema,
    description: optionalText(1000),
    amount: decimalSchema.pipe(z.number().min(0, "Não pode ser negativo.")),
    periodicity: periodicitySchema,
    startDate: dateSchema,
    endDate: optionalDateSchema,
    desiredMargin: decimalSchema.pipe(
      z.number().min(0, "Não pode ser negativa.").lt(100, "Deve ser menor que 100%."),
    ),
    taxRate: optionalDecimalSchema
      .transform((v) => v ?? 0)
      .pipe(z.number().min(0, "Não pode ser negativa.").max(100, "Máximo de 100%.")),
    expectedHours: optionalDecimalSchema.refine((v) => v === null || v > 0, "Deve ser maior que zero."),
    status: contractStatusSchema,
  })
  .refine((d) => d.periodicity !== "projeto" || d.endDate !== null, {
    message: "Projeto fechado precisa de data de término.",
    path: ["endDate"],
  })
  .refine((d) => d.endDate === null || d.endDate >= d.startDate, {
    message: "O término não pode ser antes do início.",
    path: ["endDate"],
  });

export const expenseSchema = z
  .object({
    contractId: z.uuid(),
    description: z.string().trim().min(2, "Descreva o gasto.").max(200, "Máximo de 200 caracteres."),
    category: expenseCategorySchema,
    amount: decimalSchema.pipe(z.number().min(0, "Não pode ser negativo.")),
    expenseDate: dateSchema,
    recurrence: expenseRecurrenceSchema,
    endDate: optionalDateSchema,
  })
  .refine((d) => d.recurrence !== "pontual" || d.endDate === null, {
    message: "Gasto pontual não tem fim de recorrência.",
    path: ["endDate"],
  })
  .refine((d) => d.endDate === null || d.endDate >= d.expenseDate, {
    message: "O fim não pode ser antes do início.",
    path: ["endDate"],
  });

const optionalTimeSchema = fromForm(
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^\d{2}:\d{2}(:\d{2})?$/.test(v), "Informe um horário válido."),
);

export const timeEntrySchema = z
  .object({
    contractId: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .refine((v) => v === null || z.uuid().safeParse(v).success, "Contrato inválido."),
    activityId: z.uuid("Escolha uma atividade."),
    entryDate: dateSchema,
    startTime: optionalTimeSchema,
    endTime: optionalTimeSchema,
    duration: fromForm(z.string().trim()),
    description: optionalText(500),
  })
  .refine((d) => (d.startTime === null) === (d.endTime === null), {
    message: "Informe início e fim, ou deixe os dois vazios.",
    path: ["endTime"],
  })
  .refine((d) => d.startTime !== null || d.duration !== "", {
    message: "Informe a duração ou o intervalo de horas.",
    path: ["duration"],
  });

export const reviewSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Selecione ao menos um apontamento."),
  status: z.enum(["aprovado", "rejeitado"]),
  comment: optionalText(500),
});

export const periodLockSchema = z.object({
  lockedThrough: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Informe uma data válida."),
});

export const updateMemberSchema = z.object({
  profileId: z.uuid(),
  role: roleSchema,
  canViewCosts: checkboxSchema,
  active: checkboxSchema,
});
