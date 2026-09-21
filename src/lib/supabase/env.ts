/**
 * Variáveis públicas do Supabase.
 *
 * As referências a `process.env.NEXT_PUBLIC_*` precisam ser literais para o
 * Next.js gravá-las no código durante o build. Por isso ficam aqui, uma vez.
 *
 * A chave "anon" é pública por definição (a segurança vem do RLS). Como a
 * Vercel implica com qualquer variável `NEXT_PUBLIC_` que tenha "KEY" no nome,
 * aceitamos também `NEXT_PUBLIC_SUPABASE_ANON`, que passa sem o alerta.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON;

export function getSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (ou NEXT_PUBLIC_SUPABASE_ANON) não configuradas (veja .env.example).",
    );
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}
