// Junta todas as migrations em um único arquivo para colar no SQL Editor do
// Supabase (alternativa ao `supabase db push`).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const outFile = join(root, "supabase", "schema-completo.sql");

const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
const sql = files
  .map((file) => `-- ======== ${file} ========\n${readFileSync(join(migrationsDir, file), "utf8").trim()}\n`)
  .join("\n");

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(
  outFile,
  `-- Gerado por "npm run db:bundle" a partir de supabase/migrations.\n` +
    `-- Cole este conteúdo no SQL Editor do Supabase e execute.\n\n${sql}`,
  "utf8",
);

console.log(`${files.length} migration(s) → supabase/schema-completo.sql`);
