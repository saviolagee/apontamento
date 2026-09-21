import { describe, expect, it } from "vitest";
import { parseAuthHash } from "./hash-tokens";

describe("links de convite e recuperação", () => {
  it("lê a sessão de um convite e exige definir senha", () => {
    const result = parseAuthHash(
      "#access_token=abc.def.ghi&expires_in=3600&refresh_token=rt123&token_type=bearer&type=invite",
    );
    expect(result).toEqual({
      kind: "session",
      accessToken: "abc.def.ghi",
      refreshToken: "rt123",
      needsPassword: true,
    });
  });

  it("recuperação de senha também leva à tela de senha", () => {
    const result = parseAuthHash("#access_token=a&refresh_token=b&type=recovery");
    expect(result).toMatchObject({ kind: "session", needsPassword: true });
  });

  it("magic link entra direto", () => {
    const result = parseAuthHash("#access_token=a&refresh_token=b&type=magiclink");
    expect(result).toMatchObject({ kind: "session", needsPassword: false });
  });

  it("traduz link expirado", () => {
    const result = parseAuthHash(
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    expect(result).toEqual({ kind: "error", message: "O link expirou. Peça um novo convite ao administrador." });
  });

  it("usa a descrição quando o código é desconhecido", () => {
    const result = parseAuthHash("#error_code=server_error&error_description=Algo+deu+errado");
    expect(result).toEqual({ kind: "error", message: "Algo deu errado" });
  });

  it("ignora hash sem tokens", () => {
    expect(parseAuthHash("")).toBeNull();
    expect(parseAuthHash("#secao=contratos")).toBeNull();
    expect(parseAuthHash("#access_token=a")).toBeNull();
  });
});
