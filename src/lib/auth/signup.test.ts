import { describe, expect, it } from "vitest";
import { isExistingAccount } from "./signup";

describe("cadastro de e-mail já existente", () => {
  it("reconhece a resposta disfarçada do Supabase", () => {
    // Conta já existia: vem usuário, sem identidades e sem e-mail enviado
    expect(isExistingAccount({ identities: [] })).toBe(true);
  });

  it("cadastro novo tem identidade", () => {
    expect(isExistingAccount({ identities: [{ provider: "email" }] })).toBe(false);
  });

  it("não confunde ausência de usuário ou de campo", () => {
    expect(isExistingAccount(null)).toBe(false);
    expect(isExistingAccount(undefined)).toBe(false);
    expect(isExistingAccount({})).toBe(false);
    expect(isExistingAccount({ identities: null })).toBe(false);
  });
});
