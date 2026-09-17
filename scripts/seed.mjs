/**
 * Popula a base de demonstração.
 *
 *   npm run seed -- --email voce@empresa.com           popula a sua empresa
 *   npm run seed -- --email voce@empresa.com --reset   apaga os dados antes
 *
 * Requer SUPABASE_DB_URL no .env.local e uma conta já cadastrada no app.
 */
import pg from "pg";
import { runSeed } from "./seed-core.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : true;
};

const email = flag("email");
const reset = args.includes("--reset");
const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString || typeof email !== "string") {
  console.error(
    [
      "Uso: npm run seed -- --email voce@empresa.com [--reset]",
      "",
      "Requer SUPABASE_DB_URL no .env.local (Project Settings → Database → Connection string)",
      "e uma conta já cadastrada no app com esse e-mail.",
    ].join("\n"),
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  application_name: "apontamento-seed",
});

await client.connect();

try {
  await client.query("begin");
  const summary = await runSeed(client, { email, reset });
  await client.query("commit");

  console.log(
    [
      "",
      summary.createdTenant ? `Empresa criada e vinculada a ${email}.` : `Dados inseridos na empresa de ${email}.`,
      "",
      `  ${summary.employees} colaboradores · ${summary.clients} clientes · ${summary.contracts} contratos`,
      `  ${summary.entries} apontamentos (${summary.hours}h) de ${summary.windowStart} a ${summary.windowEnd}`,
      `  Período fechado até ${summary.lockedThrough} · mês atual pendente de aprovação`,
      "",
      "Abra /dashboard para ver a rentabilidade.",
    ].join("\n"),
  );
} catch (error) {
  await client.query("rollback");
  console.error(`\nSeed não aplicado: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await client.end();
}
