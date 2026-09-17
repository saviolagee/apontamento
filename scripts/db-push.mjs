/**
 * Aplica as migrations de supabase/migrations no banco apontado por
 * SUPABASE_DB_URL, registrando o que já foi aplicado em
 * supabase_migrations.schema_migrations (mesma tabela usada pela CLI oficial).
 *
 *   npm run db:apply                          aplica o que falta
 *   npm run db:apply -- --baseline 2026...03  marca até essa versão como
 *                                             aplicada, sem executar
 *   npm run db:apply -- --dry-run             só lista o que seria aplicado
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  return args[i + 1]?.startsWith("--") || args[i + 1] === undefined ? true : args[i + 1];
};
const dryRun = args.includes("--dry-run");
const baseline = flag("baseline");

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error(
    [
      "SUPABASE_DB_URL não definida.",
      "",
      "No painel do Supabase: Project Settings → Database → Connection string → URI",
      "(use a conexão direta ou o Session pooler, porta 5432).",
      "Coloque em .env.local:",
      "",
      '  SUPABASE_DB_URL="postgresql://postgres:SUA_SENHA@db.xxxx.supabase.co:5432/postgres"',
    ].join("\n"),
  );
  process.exit(1);
}

const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((file) => ({ file, version: file.split("_")[0], name: file.replace(/^\d+_/, "").replace(/\.sql$/, "") }));

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  application_name: "apontamento-db-push",
});

await client.connect();

await client.query(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    name text,
    inserted_at timestamptz not null default now()
  );
`);

const { rows: applied } = await client.query("select version from supabase_migrations.schema_migrations");
const appliedVersions = new Set(applied.map((r) => r.version));

if (baseline) {
  const marked = migrations.filter((m) => m.version <= baseline && !appliedVersions.has(m.version));
  for (const m of marked) {
    await client.query(
      "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2) on conflict do nothing",
      [m.version, m.name],
    );
  }
  console.log(`Marcadas como aplicadas (sem executar): ${marked.map((m) => m.file).join(", ") || "nenhuma"}`);
  await client.end();
  process.exit(0);
}

const pending = migrations.filter((m) => !appliedVersions.has(m.version));

if (pending.length === 0) {
  console.log("Nada a aplicar: o banco já está atualizado.");
  await client.end();
  process.exit(0);
}

console.log(`${pending.length} migration(s) pendente(s):`);
for (const m of pending) console.log(`  - ${m.file}`);

if (dryRun) {
  await client.end();
  process.exit(0);
}

for (const m of pending) {
  const sql = readFileSync(join(migrationsDir, m.file), "utf8");
  process.stdout.write(`Aplicando ${m.file}... `);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query(
      "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)",
      [m.version, m.name],
    );
    await client.query("commit");
    console.log("ok");
  } catch (err) {
    await client.query("rollback");
    console.log("ERRO");
    console.error(`\n${err.message}\n`);
    if (/already exists|já existe/i.test(err.message)) {
      console.error(
        `Se essa migration já foi aplicada manualmente, registre-a com:\n  npm run db:apply -- --baseline ${m.version}`,
      );
    }
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("Banco atualizado.");
