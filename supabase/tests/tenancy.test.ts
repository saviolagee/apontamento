import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createAuthUser, createTestDb, expectError } from "./helpers/db";

describe("multiempresa, perfis e RLS", () => {
  let db: PGlite;
  let adminA: string;
  let adminB: string;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    db = await createTestDb();

    adminA = await createAuthUser(db, "dono@empresa-a.com");
    adminB = await createAuthUser(db, "dono@empresa-b.com");

    tenantA = await asUser(db, adminA, async () => {
      const r = await db.query<{ id: string }>(
        "select public.create_tenant('Empresa A', '11.222.333/0001-81', 'Ana Dona') as id",
      );
      return r.rows[0].id;
    });
    tenantB = await asUser(db, adminB, async () => {
      const r = await db.query<{ id: string }>(
        "select public.create_tenant('Empresa B', null, 'Bruno Dono') as id",
      );
      return r.rows[0].id;
    });
  }, 60_000);

  it("create_tenant cria empresa e perfil admin", async () => {
    const r = await db.query<{ role: string; cnpj: string }>(
      "select p.role, t.cnpj from public.profiles p join public.tenants t on t.id = p.tenant_id where p.id = $1",
      [adminA],
    );
    expect(r.rows[0]).toEqual({ role: "admin", cnpj: "11222333000181" });
  });

  it("não permite criar segunda empresa para o mesmo usuário", async () => {
    const msg = await asUser(db, adminA, () =>
      expectError(db.query("select public.create_tenant('Outra', null, 'Ana')")),
    );
    expect(msg).toContain("já pertence");
  });

  it("isola dados entre empresas", async () => {
    const tenants = await asUser(db, adminA, () => db.query<{ id: string }>("select id from public.tenants"));
    expect(tenants.rows.map((t) => t.id)).toEqual([tenantA]);

    const profiles = await asUser(db, adminA, () => db.query<{ id: string }>("select id from public.profiles"));
    expect(profiles.rows.map((p) => p.id)).toEqual([adminA]);

    const upd = await asUser(db, adminA, () =>
      db.query("update public.tenants set name = 'Hackeada' where id = $1", [tenantB]),
    );
    expect(upd.affectedRows).toBe(0);
  });

  it("anônimo não lê nada", async () => {
    const msg = await asAnon(db, () => expectError(db.query("select * from public.tenants")));
    expect(msg).toContain("permission denied");
  });

  describe("convites e papéis", () => {
    let gestor: string;
    let colaborador: string;

    beforeAll(async () => {
      await asUser(db, adminA, async () => {
        await db.query(
          "insert into public.invitations (tenant_id, email, full_name, role) values ($1, 'Gestor@Empresa-A.com', 'Gil Gestor', 'gestor')",
          [tenantA],
        );
        await db.query(
          "insert into public.invitations (tenant_id, email, full_name, role, can_view_costs) values ($1, 'colab@empresa-a.com', 'Carla Colab', 'colaborador', true)",
          [tenantA],
        );
      });
      // Convite aceito automaticamente quando o usuário é criado no Auth
      gestor = await createAuthUser(db, "gestor@empresa-a.com");
      colaborador = await createAuthUser(db, "colab@empresa-a.com");
    });

    it("usuário convidado entra na empresa com o papel do convite", async () => {
      const r = await db.query<{ id: string; role: string; tenant_id: string; can_view_costs: boolean }>(
        "select id, role, tenant_id, can_view_costs from public.profiles where id in ($1, $2) order by role",
        [gestor, colaborador],
      );
      expect(r.rows).toEqual([
        { id: gestor, role: "gestor", tenant_id: tenantA, can_view_costs: false },
        // can_view_costs só vale para gestor, mas o convite guardou true — o helper ignora para colaborador
        { id: colaborador, role: "colaborador", tenant_id: tenantA, can_view_costs: true },
      ]);
      const canView = await asUser(db, colaborador, () =>
        db.query<{ v: boolean }>("select private.can_view_costs() as v"),
      );
      expect(canView.rows[0].v).toBe(false);
    });

    it("usuário existente aceita convite ao entrar", async () => {
      const late = await createAuthUser(db, "tardio@x.com");
      await asUser(db, adminA, () =>
        db.query(
          "insert into public.invitations (tenant_id, email, full_name) values ($1, 'tardio@x.com', 'Tito Tardio')",
          [tenantA],
        ),
      );
      const r = await asUser(db, late, () =>
        db.query<{ t: string }>("select public.accept_pending_invitation() as t"),
      );
      expect(r.rows[0].t).toBe(tenantA);
    });

    it("não convida e-mail já vinculado a outra empresa", async () => {
      const msg = await asUser(db, adminB, () =>
        expectError(
          db.query(
            "insert into public.invitations (tenant_id, email, full_name) values ($1, 'gestor@empresa-a.com', 'Gil')",
            [tenantB],
          ),
        ),
      );
      expect(msg).toContain("já está vinculado");
    });

    it("gestor e colaborador não criam convites nem veem convites", async () => {
      for (const uid of [gestor, colaborador]) {
        const msg = await asUser(db, uid, () =>
          expectError(
            db.query("insert into public.invitations (tenant_id, email, full_name) values ($1, 'novo@x.com', 'Novo')", [
              tenantA,
            ]),
          ),
        );
        expect(msg).toContain("row-level security");
        const rows = await asUser(db, uid, () => db.query("select * from public.invitations"));
        expect(rows.rows).toHaveLength(0);
      }
    });

    it("usuário não consegue se promover a admin", async () => {
      const msg = await asUser(db, colaborador, () =>
        expectError(db.query("update public.profiles set role = 'admin' where id = $1", [colaborador])),
      );
      expect(msg).toContain("permission denied");

      const msg2 = await asUser(db, gestor, () =>
        expectError(db.query("select public.admin_update_member($1, 'admin', true, true)", [gestor])),
      );
      expect(msg2).toContain("Apenas administradores");
    });

    it("usuário altera o próprio nome, mas não o de outros", async () => {
      await asUser(db, colaborador, () =>
        db.query("update public.profiles set full_name = 'Carla C.' where id = $1", [colaborador]),
      );
      const other = await asUser(db, colaborador, () =>
        db.query("update public.profiles set full_name = 'X' where id = $1", [gestor]),
      );
      expect(other.affectedRows).toBe(0);
      const r = await db.query<{ full_name: string }>("select full_name from public.profiles where id = $1", [
        colaborador,
      ]);
      expect(r.rows[0].full_name).toBe("Carla C.");
    });

    it("gestor não altera dados da empresa", async () => {
      const r = await asUser(db, gestor, () =>
        db.query("update public.tenants set monthly_hours = 1 where id = $1", [tenantA]),
      );
      expect(r.affectedRows).toBe(0);
    });

    it("admin altera papel e permissão de custo do gestor", async () => {
      await asUser(db, adminA, () => db.query("select public.admin_update_member($1, 'gestor', true, true)", [gestor]));
      const r = await asUser(db, gestor, () => db.query<{ v: boolean }>("select private.can_view_costs() as v"));
      expect(r.rows[0].v).toBe(true);
    });

    it("admin não altera membros de outra empresa", async () => {
      const msg = await asUser(db, adminB, () =>
        expectError(db.query("select public.admin_update_member($1, 'colaborador', false, false)", [gestor])),
      );
      expect(msg).toContain("não encontrado");
    });

    it("mantém pelo menos um admin ativo", async () => {
      const msg = await asUser(db, adminA, () =>
        expectError(db.query("select public.admin_update_member($1, 'gestor', false, true)", [adminA])),
      );
      expect(msg).toContain("pelo menos um administrador");
    });

    it("usuário inativo perde acesso a tudo", async () => {
      await asUser(db, adminA, () =>
        db.query("select public.admin_update_member($1, 'colaborador', false, false)", [colaborador]),
      );
      const r = await asUser(db, colaborador, () => db.query("select * from public.tenants"));
      expect(r.rows).toHaveLength(0);
    });
  });

  describe("storage de logos", () => {
    it("admin envia logo só na pasta da própria empresa", async () => {
      await asUser(db, adminA, () =>
        db.query("insert into storage.objects (bucket_id, name) values ('logos', $1)", [`${tenantA}/logo.png`]),
      );
      const msg = await asUser(db, adminA, () =>
        expectError(
          db.query("insert into storage.objects (bucket_id, name) values ('logos', $1)", [`${tenantB}/logo.png`]),
        ),
      );
      expect(msg).toContain("row-level security");
    });
  });
});
