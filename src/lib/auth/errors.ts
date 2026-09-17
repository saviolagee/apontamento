const MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha inválidos.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  user_already_exists: "Já existe uma conta com este e-mail.",
  email_exists: "Já existe uma conta com este e-mail.",
  weak_password: "Senha muito fraca. Use pelo menos 8 caracteres.",
  over_email_send_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  otp_expired: "O link expirou. Solicite um novo.",
  same_password: "A nova senha precisa ser diferente da atual.",
};

/** Traduz erros do Supabase Auth/Postgres para mensagens em português. */
export function translateError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return "Não foi possível concluir a operação.";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  const message = error.message ?? "";
  // Erros vindos de `raise exception` no Postgres já estão em português.
  if (/[áâãéêíóôõúç]/i.test(message) || message.includes("empresa")) return message;
  if (message.includes("Invalid login credentials")) return MESSAGES.invalid_credentials;
  if (message.includes("Email not confirmed")) return MESSAGES.email_not_confirmed;
  if (message.includes("already registered")) return MESSAGES.user_already_exists;
  return message || "Não foi possível concluir a operação.";
}
