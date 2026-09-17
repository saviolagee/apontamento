import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDb, expectError } from "./helpers/db";

describe("cadastros: áreas, atividades, colaboradores e clientes", () => {
  let db: PGlite;
  let admin: string;
  let gestor: string;
  let colaborador: string;
  let tenant: string;
  let areaId: string;
  let employeeId: string;

  beforeAll(async () => {
    db = await createTestDb();
    admin = await createAuthUser(db, "dono@empresa.com");
    tenant = await asUser(db, admin, async () => {
      const r = await db.query<{ id: string }>("select public.create_tenant('Empresa', null, 'Ana Dona') as id");
      return r.rows[0].id;
    });

    await asUser(db, admin, async () => {
      await db.query(
        "insert into public.invitations (tenant_id, email, full_name, role) values ($1, 'gestor@empresa.com', 'Gil Gestor', 'gestor')",
        [tenant],
      );
      await db.query(
        "insert into public.invitations (tenant_id, email, full_name, role) values ($1, 'colab@empresa.com', 'Carla Colab', 'colaborador')",
        [tenant],
      );
    });
    gestor = await createAuthUser(db, "gestor@empresa.com");
    colaborador = await createAuthUser(db, "colab@empresa.com");

    areaId = await asUser(db, gestor, async () => {
      const r = await db.query<{ id: string }>(
        "insert into public.areas (tenant_id, name, description) values ($1, 'Contábil', 'Rotinas contábeis') returning id",
        [tenant],
      );
      return r.rows[0].id;
    });
  }, 60_000);

  it("cria colaborador para quem cria a empresa e para quem aceita convite", async () => {
    const r = await db.query<{ full_name: string; profile_id: string }>(
      "select full_name, profile_id from public.employees where tenant_id = $1 order by full_name",
      [tenant],
    );
    expect(r.rows.map((e) => e.full_name)).toEqual(["Ana Dona", "Carla Colab", "Gil Gestor"]);
    expect(r.rows.every((e) => e.profile_id !== null)).toBe(true);
    employeeId = (
      await db.query<{ id: string }>("select id from public.employees where full_name = 'Carla Colab'")
    ).rows[0].id;
  });

  it("gestor cadastra atividades; colaborador só lê", async () => {
    await asUser(db, gestor, () =>
      db.query(
        "insert into public.activities (tenant_id, area_id, name, billable) values ($1, $2, 'Apuração fiscal', true)",
        [tenant, areaId],
      ),
    );
    const read = await asUser(db, colaborador, () => db.query("select * from public.activities"));
    expect(read.rows).toHaveLength(1);

    const msg = await asUser(db, colaborador, () =>
      expectError(
        db.query("insert into public.activities (tenant_id, name) values ($1, 'Inventada')", [tenant]),
      ),
    );
    expect(msg).toContain("row-level security");
  });

  it("não permite área duplicada na mesma empresa", async () => {
    const msg = await asUser(db, gestor, () =>
      expectError(db.query("insert into public.areas (tenant_id, name) values ($1, 'contábil')", [tenant])),
    );
    expect(msg).toContain("duplicate key");
  });

  it("calcula o custo hora com encargos e benefícios", async () => {
    await asUser(db, admin, () =>
      db.query("select public.set_employee_cost($1, 8000, 80, 0, 600, 168, '2026-01-01')", [employeeId]),
    );
    const r = await db.query<{ hourly_cost: string }>(
      "select hourly_cost from public.employee_costs where employee_id = $1",
      [employeeId],
    );
    // (8000 + 6400 + 600) / 168 = 89,2857
    expect(Number(r.rows[0].hourly_cost)).toBeCloseTo(89.2857, 4);
  });

  it("nova vigência fecha a anterior e preserva o custo do período passado", async () => {
    await asUser(db, admin, () =>
      db.query("select public.set_employee_cost($1, 10000, 80, 0, 600, 168, '2026-04-01')", [employeeId]),
    );
    const rows = await asUser(db, admin, () =>
      db.query<{ valid_from: Date; valid_to: Date | null }>(
        "select valid_from, valid_to from public.employee_costs where employee_id = $1 order by valid_from",
        [employeeId],
      ),
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0].valid_to?.toISOString().slice(0, 10)).toBe("2026-03-31");
    expect(rows.rows[1].valid_to).toBeNull();

    const marco = await db.query<{ c: string }>("select private.employee_hourly_cost($1, '2026-03-15') as c", [
      employeeId,
    ]);
    const abril = await db.query<{ c: string }>("select private.employee_hourly_cost($1, '2026-04-15') as c", [
      employeeId,
    ]);
    expect(Number(marco.rows[0].c)).toBeCloseTo(89.2857, 4);
    // (10000 + 8000 + 600) / 168 = 110,7143
    expect(Number(abril.rows[0].c)).toBeCloseTo(110.7143, 4);
  });

  it("rejeita vigências sobrepostas", async () => {
    const msg = await asUser(db, admin, () =>
      expectError(
        db.query(
          "insert into public.employee_costs (tenant_id, employee_id, monthly_salary, monthly_hours, valid_from) values ($1, $2, 5000, 168, '2026-02-01')",
          [tenant, employeeId],
        ),
      ),
    );
    expect(msg).toContain("custo vigente nesse período");
  });

  it("colaborador e gestor sem permissão não enxergam custos", async () => {
    for (const uid of [colaborador, gestor]) {
      const r = await asUser(db, uid, () => db.query("select * from public.employee_costs"));
      expect(r.rows).toHaveLength(0);
    }

    // Admin libera "ver custos" para o gestor
    const gestorProfile = gestor;
    await asUser(db, admin, () =>
      db.query("select public.admin_update_member($1, 'gestor', true, true)", [gestorProfile]),
    );
    const visible = await asUser(db, gestor, () => db.query("select * from public.employee_costs"));
    expect(visible.rows.length).toBeGreaterThan(0);
  });

  it("gestor com permissão de ver custos ainda não pode alterá-los", async () => {
    const msg = await asUser(db, gestor, () =>
      expectError(db.query("select public.set_employee_cost($1, 1, 0, 0, 0, 100, '2027-01-01')", [employeeId])),
    );
    expect(msg).toContain("Apenas administradores");
  });

  it("isola cadastros entre empresas", async () => {
    const outro = await createAuthUser(db, "outro@empresa-b.com");
    await asUser(db, outro, () => db.query("select public.create_tenant('Empresa B', null, 'Bruno')"));

    const areas = await asUser(db, outro, () => db.query("select * from public.areas"));
    expect(areas.rows).toHaveLength(0);

    const msg = await asUser(db, outro, () =>
      expectError(db.query("insert into public.areas (tenant_id, name) values ($1, 'Invasora')", [tenant])),
    );
    expect(msg).toContain("row-level security");

    const employees = await asUser(db, outro, () => db.query("select * from public.employees"));
    expect(employees.rows).toHaveLength(1); // só o próprio Bruno
  });

  it("cliente exige CNPJ só com dígitos e não duplica razão social", async () => {
    await asUser(db, gestor, () =>
      db.query(
        "insert into public.clients (tenant_id, legal_name, trade_name, cnpj) values ($1, 'Cliente Um LTDA', 'Um', '11222333000181')",
        [tenant],
      ),
    );
    const dup = await asUser(db, gestor, () =>
      expectError(
        db.query("insert into public.clients (tenant_id, legal_name) values ($1, 'cliente um ltda')", [tenant]),
      ),
    );
    expect(dup).toContain("duplicate key");

    const invalid = await asUser(db, gestor, () =>
      expectError(
        db.query("insert into public.clients (tenant_id, legal_name, cnpj) values ($1, 'Outro', '11.222')", [tenant]),
      ),
    );
    expect(invalid).toContain("clients_cnpj_check");
  });
});
