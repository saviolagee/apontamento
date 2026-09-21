import pg from "pg";

const EMAIL = "savio@binariconsultoria.com.br";
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const u = await c.query(
  `select id, email, email_confirmed_at, last_sign_in_at, banned_until,
          (encrypted_password is not null and encrypted_password <> '') as tem_senha,
          (select count(*)::int from auth.identities i where i.user_id = u.id) as identidades
   from auth.users u where lower(email) = $1`,
  [EMAIL],
);
console.log("CONTA:", JSON.stringify(u.rows[0] ?? "nao existe", null, 2));

const p = await c.query(
  `select p.role::text as role, p.active, p.full_name, t.name as empresa, t.email_domain, t.auto_join_domain
   from public.profiles p join public.tenants t on t.id = p.tenant_id where lower(p.email) = $1`,
  [EMAIL],
);
console.log("PERFIL:", JSON.stringify(p.rows[0] ?? "sem perfil", null, 2));

const e = await c.query(
  "select full_name, active, profile_id is not null as vinculado from public.employees where lower(email) = $1",
  [EMAIL],
);
console.log("COLABORADOR:", JSON.stringify(e.rows[0] ?? "sem cadastro", null, 2));

await c.end();
