import { describe, expect, it } from "vitest";
import { parseForm } from "@/lib/actions";
import { clientSchema, employeeSchema, expenseSchema, timeEntrySchema } from "./schemas";

/**
 * Regressão: formulários enviam só os campos que estão na tela. Campos
 * escondidos (ou checkbox desmarcado) chegam ausentes no FormData e não podem
 * derrubar a validação.
 */
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
};

describe("formulários com campos ausentes", () => {
  it("cadastra cliente só com razão social (tela de novo cliente)", () => {
    const result = parseForm(clientSchema, form({ legalName: "Cliente Um LTDA", tradeName: "", cnpj: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        legalName: "Cliente Um LTDA",
        tradeName: null,
        cnpj: null,
        contactName: null,
        email: null,
        phone: null,
        notes: null,
        active: false,
      });
    }
  });

  it("cadastra colaborador sem horas e sem cargo", () => {
    const result = parseForm(employeeSchema, form({ fullName: "Carla Souza", email: "", jobTitle: "", monthlyHours: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.monthlyHours).toBeNull();
  });

  it("lança horas por duração, sem os campos de início e fim", () => {
    const result = parseForm(
      timeEntrySchema,
      form({ entryDate: "2026-09-17", contractId: "", activityId: "0b5f2b3a-3f4a-4c56-9f0e-2b6f1a2c3d4e", duration: "1:30", description: "" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.startTime).toBeNull();
      expect(result.data.endTime).toBeNull();
      expect(result.data.contractId).toBeNull();
    }
  });

  it("lança horas pelo cronômetro (só data, atividade e duração)", () => {
    const result = parseForm(
      timeEntrySchema,
      form({ entryDate: "2026-09-17", activityId: "0b5f2b3a-3f4a-4c56-9f0e-2b6f1a2c3d4e", duration: "45m", contractId: "" }),
    );
    expect(result.ok).toBe(true);
  });

  it("lança gasto pontual, sem o campo de fim da recorrência", () => {
    const result = parseForm(
      expenseSchema,
      form({
        contractId: "0b5f2b3a-3f4a-4c56-9f0e-2b6f1a2c3d4e",
        description: "Passagens",
        category: "deslocamento",
        amount: "800,00",
        expenseDate: "2026-09-10",
        recurrence: "pontual",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.endDate).toBeNull();
  });

  it("continua reclamando do que é realmente obrigatório", () => {
    const semNome = parseForm(clientSchema, form({ legalName: "" }));
    expect(semNome.ok).toBe(false);
    if (!semNome.ok) expect(semNome.state.fieldErrors?.legalName).toBeDefined();

    const semDuracao = parseForm(
      timeEntrySchema,
      form({ entryDate: "2026-09-17", activityId: "0b5f2b3a-3f4a-4c56-9f0e-2b6f1a2c3d4e" }),
    );
    expect(semDuracao.ok).toBe(false);

    const cnpjInvalido = parseForm(clientSchema, form({ legalName: "Cliente", cnpj: "11.222.333/0001-00" }));
    expect(cnpjInvalido.ok).toBe(false);
  });
});
