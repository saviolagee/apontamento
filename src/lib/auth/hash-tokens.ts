/**
 * Links de convite e de recuperação do Supabase voltam com os dados na
 * "hash" da URL (#access_token=...), que o navegador nunca envia ao servidor.
 * Por isso o tratamento é feito no cliente, a partir do que está aqui.
 */
export type AuthHashResult =
  | { kind: "session"; accessToken: string; refreshToken: string; needsPassword: boolean }
  | { kind: "error"; message: string }
  | null;

const ERROR_MESSAGES: Record<string, string> = {
  otp_expired: "O link expirou. Peça um novo convite ao administrador.",
  access_denied: "O link já foi usado ou expirou. Peça um novo convite ao administrador.",
};

export function parseAuthHash(hash: string): AuthHashResult {
  const params = new URLSearchParams(hash.replace(/^#/, ""));

  const errorCode = params.get("error_code") ?? params.get("error");
  if (errorCode) {
    return {
      kind: "error",
      message: ERROR_MESSAGES[errorCode] ?? params.get("error_description")?.replace(/\+/g, " ") ?? "Link inválido.",
    };
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  // Convite e recuperação exigem que a pessoa defina uma senha antes de usar
  const type = params.get("type");
  return {
    kind: "session",
    accessToken,
    refreshToken,
    needsPassword: type === "invite" || type === "recovery",
  };
}
