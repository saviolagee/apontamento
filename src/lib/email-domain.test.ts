import { describe, expect, it } from "vitest";
import { emailDomain, isPublicEmailDomain, isValidDomain, normalizeDomain } from "./email-domain";

describe("domínio de e-mail", () => {
  it("extrai o domínio", () => {
    expect(emailDomain("Ana@ConsultoriaM3.com.br")).toBe("consultoriam3.com.br");
    expect(emailDomain("sem-arroba")).toBeNull();
    expect(emailDomain(null)).toBeNull();
  });

  it("reconhece provedores pessoais", () => {
    expect(isPublicEmailDomain("gmail.com")).toBe(true);
    expect(isPublicEmailDomain("UOL.com.br")).toBe(true);
    expect(isPublicEmailDomain("consultoriam3.com.br")).toBe(false);
    expect(isPublicEmailDomain(null)).toBe(false);
  });

  it("normaliza domínio colado do e-mail", () => {
    expect(normalizeDomain("ana@EMPRESA.com.br")).toBe("empresa.com.br");
    expect(normalizeDomain(" empresa.com.br ")).toBe("empresa.com.br");
  });

  it("valida formato", () => {
    expect(isValidDomain("empresa.com.br")).toBe(true);
    expect(isValidDomain("sub.empresa.com")).toBe(true);
    expect(isValidDomain("ana@empresa.com")).toBe(true);
    expect(isValidDomain("sem ponto")).toBe(false);
    expect(isValidDomain("empresa")).toBe(false);
    expect(isValidDomain("-empresa.com")).toBe(false);
  });
});
