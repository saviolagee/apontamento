/**
 * O Supabase evita revelar quais e-mails já têm conta: um cadastro repetido
 * responde "sucesso", sem sessão e com a lista de identidades vazia — e sem
 * mandar e-mail nenhum. É por isso que só o `error` não basta.
 */
export function isExistingAccount(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return Boolean(user) && Array.isArray(user?.identities) && user.identities.length === 0;
}
