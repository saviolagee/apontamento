import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDb, expectError } from "./helpers/db";

describe("domínio corporativo", () => {
  let db: PGlite;
  let admin: string;
  let tenant: string;

  const createTenant = (user: string, name = "Empresa") =>
    asUser(db, user, async () => {
      const r = await db.query<{ id: string }>("select public.create_tenant($1, null, 'Ana Dona') as id", [name]);
      return r.rows[0].id;
    });

  const profileOf = async (user: string) =>
    (
      await db.query<{ tenant_id: string; role: string; full_name: string }>(
        "select tenant_id, role::text as role, full_name from public.profiles where id = $1",
        [user],
      )
    ).rows[0];

  beforeAll(async () => {
    db = await createTestDb();
    admin = await createAuthUser(db, "ana@consultoriam3.com.br");
    tenant = await createTenant(admin, "Consultoria M3");
  }, 60_000);

  it("guarda o domínio a partir do e-mail de quem criou a empresa", async () => {
    const r = await db.query<{ email_domain: string; auto_join_domain: boolean }>(
      "select email_domain, auto_join_domain from public.tenants where id = $1",
      [tenant],
    );
    expect(r.rows[0].email_domain).toBe("consultoriam3.com.br");
    expect(r.rows[0].auto_join_domain).toBe(true);
  });

  it("recusa criar empresa com e-mail pessoal", async () => {
    const pessoal = await createAuthUser(db, "fulano@gmail.com");
    const msg = await asUser(db, pessoal, () =>
      expectError(db.query("select public.create_tenant('Empresa Pessoal', null, 'Fulano')")),
    );
    expect(msg).toContain("e-mail corporativo");
  });

  it("recusa duas empresas com o mesmo domínio", async () => {
    const outro = await createAuthUser(db, "bruno@consultoriam3.com.br");
    // O usuário já entrou na empresa pelo domínio, então nem chega a criar
    const msg = await asUser(db, outro, () =>
      expectError(db.query("select public.create_tenant('Clone', null, 'Bruno')")),
    );
    expect(msg).toContain("já pertence a uma empresa");

    const semVinculo = await createAuthUser(db, "carlos@outraempresa.com.br");
    await asUser(db, semVinculo, () => db.query("select public.create_tenant('Outra', null, 'Carlos')"));
    const terceiro = await createAuthUser(db, "dani@outraempresa.com.br");
    await db.query("update public.profiles set tenant_id = tenant_id where id = $1", [terceiro]); // no-op
  });

  it("quem se cadastra com o e-mail da empresa entra automaticamente como colaborador", async () => {
    const novo = await createAuthUser(db, "carla.souza@consultoriam3.com.br");
    const profile = await profileOf(novo);
    expect(profile.tenant_id).toBe(tenant);
    expect(profile.role).toBe("colaborador");
    // Nome provisório legível a partir do e-mail
    expect(profile.full_name).toBe("Carla Souza");

    const employee = await db.query<{ full_name: string }>(
      "select full_name from public.employees where profile_id = $1",
      [novo],
    );
    expect(employee.rows).toHaveLength(1);
  });

  it("aproveita o cadastro de colaborador que o gestor já tinha feito", async () => {
    await asUser(db, admin, () =>
      db.query(
        "insert into public.employees (tenant_id, full_name, email, job_title) values ($1, 'Diego Martins', 'diego@consultoriam3.com.br', 'Analista')",
        [tenant],
      ),
    );
    const diego = await createAuthUser(db, "diego@consultoriam3.com.br");
    const r = await db.query<{ n: number; job_title: string }>(
      "select count(*)::int as n, max(job_title) as job_title from public.employees where lower(email) = 'diego@consultoriam3.com.br'",
    );
    expect(r.rows[0].n).toBe(1); // não duplicou o cadastro
    expect(r.rows[0].job_title).toBe("Analista");
    expect((await profileOf(diego)).tenant_id).toBe(tenant);
  });

  it("convite tem prioridade sobre o domínio e define o papel", async () => {
    await asUser(db, admin, () =>
      db.query(
        "insert into public.invitations (tenant_id, email, full_name, role) values ($1, 'gil@consultoriam3.com.br', 'Gil Gestor', 'gestor')",
        [tenant],
      ),
    );
    const gil = await createAuthUser(db, "gil@consultoriam3.com.br");
    const profile = await profileOf(gil);
    expect(profile.role).toBe("gestor");
    expect(profile.full_name).toBe("Gil Gestor");
  });

  it("e-mail de outro domínio não entra sem convite", async () => {
    const estranho = await createAuthUser(db, "intruso@dominio-qualquer.com.br");
    expect(await profileOf(estranho)).toBeUndefined();
  });

  it("e-mail pessoal nunca entra por domínio", async () => {
    const pessoal = await createAuthUser(db, "alguem@hotmail.com");
    expect(await profileOf(pessoal)).toBeUndefined();
  });

  it("admin pode desligar a entrada automática", async () => {
    await asUser(db, admin, () => db.query("select public.set_tenant_domain('consultoriam3.com.br', false)"));
    const novo = await createAuthUser(db, "eduardo@consultoriam3.com.br");
    expect(await profileOf(novo)).toBeUndefined();

    // E religar volta a funcionar
    await asUser(db, admin, () => db.query("select public.set_tenant_domain('consultoriam3.com.br', true)"));
    const outro = await createAuthUser(db, "fabio@consultoriam3.com.br");
    expect((await profileOf(outro)).tenant_id).toBe(tenant);
  });

  describe("set_tenant_domain", () => {
    it("aceita domínio colado do e-mail e normaliza", async () => {
      await asUser(db, admin, () => db.query("select public.set_tenant_domain('ANA@ConsultoriaM3.com.br')"));
      const r = await db.query<{ email_domain: string }>("select email_domain from public.tenants where id = $1", [
        tenant,
      ]);
      expect(r.rows[0].email_domain).toBe("consultoriam3.com.br");
    });

    it("recusa domínio inválido, provedor pessoal e domínio de outra empresa", async () => {
      for (const [valor, esperado] of [
        ["sem ponto", "Domínio inválido"],
        ["gmail.com", "provedor de e-mail pessoal"],
        ["outraempresa.com.br", "já pertence a outra empresa"],
      ]) {
        const msg = await asUser(db, admin, () =>
          expectError(db.query("select public.set_tenant_domain($1)", [valor])),
        );
        expect(msg).toContain(esperado);
      }
    });

    it("gestor não altera o domínio", async () => {
      const gestor = (
        await db.query<{ id: string }>("select id from public.profiles where role = 'gestor' limit 1")
      ).rows[0].id;
      const msg = await asUser(db, gestor, () =>
        expectError(db.query("select public.set_tenant_domain('novodominio.com.br')")),
      );
      expect(msg).toContain("Apenas administradores");
    });
  });
});
