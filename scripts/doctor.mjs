/**
 * Diagnóstico rápido do ambiente: variáveis, migrations aplicadas, contas de
 * acesso e dados da empresa.
 *
 *   npm run doctor
 */
import pg from "pg";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL"];

console.log("Variáveis de ambiente");
for (const name of required) {
  console.log(`  ${process.env[name] ? "ok  " : "FALTA"} ${name}`);
}
// A chave pública aceita dois nomes
const anonName = ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON"].find((n) => process.env[n]);
console.log(
  `  ${anonName ? "ok  " : "FALTA"} ${anonName ?? "NEXT_PUBLIC_SUPABASE_ANON_KEY (ou NEXT_PUBLIC_SUPABASE_ANON)"}`,
);

if (!process.env.SUPABASE_DB_URL) {
  console.log("\nSem SUPABASE_DB_URL não dá para checar o banco.");
  process.exit(0);
}

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  application_name: "apontamento-doctor",
});
await client.connect();

try {
  const migrations = await client.query(
    "select version, name from supabase_migrations.schema_migrations order by version",
  );
  console.log(`\nMigrations aplicadas: ${migrations.rowCount}`);
  for (const row of migrations.rows) console.log(`  ${row.version} ${row.name ?? ""}`);

  const tables = await client.query(
    "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
  );
  console.log(`Tabelas em public: ${tables.rows[0].n}`);

  const users = await client.query(
    "select email, email_confirmed_at, last_sign_in_at from auth.users order by created_at",
  );
  console.log(`\nContas de acesso: ${users.rowCount}`);
  for (const u of users.rows) {
    console.log(
      `  ${u.email} · e-mail ${u.email_confirmed_at ? "confirmado" : "NÃO confirmado"} · último login ${
        u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("pt-BR") : "nunca"
      }`,
    );
  }
  if (users.rowCount === 0) {
    console.log("  Nenhuma conta ainda — cadastre-se em /cadastro.");
  }

  const profiles = await client.query(
    `select p.email, p.role::text as role, p.active, t.name as tenant
     from public.profiles p join public.tenants t on t.id = p.tenant_id order by p.created_at`,
  );
  console.log(`\nUsuários vinculados a uma empresa: ${profiles.rowCount}`);
  for (const p of profiles.rows) {
    console.log(`  ${p.email} · ${p.role} · ${p.active ? "ativo" : "INATIVO"} · empresa ${p.tenant}`);
  }

  const data = await client.query(
    `select
       (select count(*)::int from public.clients) as clientes,
       (select count(*)::int from public.contracts) as contratos,
       (select count(*)::int from public.employees) as colaboradores,
       (select count(*)::int from public.time_entries) as apontamentos`,
  );
  const d = data.rows[0];
  console.log(
    `\nDados: ${d.colaboradores} colaboradores · ${d.clientes} clientes · ${d.contratos} contratos · ${d.apontamentos} apontamentos`,
  );

  const pending = await client.query(
    "select count(*)::int as n from auth.users where email_confirmed_at is null",
  );
  if (pending.rows[0].n > 0) {
    console.log(
      [
        "",
        `${pending.rows[0].n} conta(s) com e-mail não confirmado não conseguem entrar.`,
        "Opções:",
        "  1. Clicar no link do e-mail de confirmação; ou",
        "  2. Desligar a confirmação em Authentication → Sign In / Providers → Email → Confirm email; ou",
        "  3. Rodar: npm run doctor -- --confirmar voce@empresa.com",
      ].join("\n"),
    );
  }

  const confirmEmail = process.argv.includes("--confirmar")
    ? process.argv[process.argv.indexOf("--confirmar") + 1]
    : null;
  if (confirmEmail) {
    const r = await client.query(
      "update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where lower(email) = lower($1) returning email",
      [confirmEmail],
    );
    console.log(
      r.rowCount > 0 ? `\nE-mail de ${r.rows[0].email} confirmado.` : `\nNenhuma conta com o e-mail ${confirmEmail}.`,
    );
  }
} finally {
  await client.end();
}
