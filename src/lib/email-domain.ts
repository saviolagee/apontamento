/**
 * Espelho em TypeScript da regra que vale no banco
 * (private.is_public_email_domain): provedores pessoais não identificam uma
 * empresa, então não servem para criar tenant nem para entrada automática.
 */
export const PUBLIC_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.com.br",
  "outlook.com",
  "outlook.com.br",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "gmx.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "mail.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "ig.com.br",
  "globo.com",
  "globomail.com",
  "r7.com",
  "oi.com.br",
  "zipmail.com.br",
  "superig.com.br",
  "pop.com.br",
] as const;

export function emailDomain(email: string | null | undefined): string | null {
  const domain = (email ?? "").trim().toLowerCase().split("@")[1];
  return domain ? domain : null;
}

export function isPublicEmailDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  return (PUBLIC_EMAIL_DOMAINS as readonly string[]).includes(domain.trim().toLowerCase());
}

/** Aceita "ana@empresa.com.br" ou "empresa.com.br" e devolve só o domínio. */
export function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^.*@/, "");
}

export function isValidDomain(value: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalizeDomain(value));
}
