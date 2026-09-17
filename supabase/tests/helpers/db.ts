import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Postgres real (PGlite/WASM) com um "esqueleto" do ambiente Supabase:
 * papéis anon/authenticated/service_role, auth.users, auth.uid(), storage
 * e os mesmos default privileges que o Supabase aplica no schema public.
 * Permite testar migrations e RLS sem Docker.
 */
const SUPABASE_BOOTSTRAP = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    email_confirmed_at timestamptz,
    raw_user_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text,
    owner uuid
  );
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects, storage.buckets to authenticated, service_role;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_BOOTSTRAP);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    } catch (err) {
      throw new Error(`Falha na migration ${file}: ${(err as Error).message}`);
    }
  }
  return db;
}

export async function createAuthUser(db: PGlite, email: string, confirmed = true): Promise<string> {
  const res = await db.query<{ id: string }>(
    "insert into auth.users (email, email_confirmed_at) values ($1, $2) returning id",
    [email, confirmed ? new Date().toISOString() : null],
  );
  return res.rows[0].id;
}

/** Executa `fn` como um usuário autenticado (RLS ativo). */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(
    `select set_config('request.jwt.claims', '${JSON.stringify({ sub: userId, role: "authenticated" })}', false);
     set role authenticated;`,
  );
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
  }
}

export async function asAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role anon;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}

/** Espera que a promise falhe; retorna a mensagem de erro. */
export async function expectError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error("Era esperado um erro, mas a operação teve sucesso.");
}
