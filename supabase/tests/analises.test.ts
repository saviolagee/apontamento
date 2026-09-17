import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDb } from "./helpers/db";

describe("agregações do dashboard", () => {
  let db: PGlite;
  let admin: string;
  let gestor: string;
  let colaborador: string;
  let tenant: string;
  let carlaId: string;

  beforeAll(async () => {
    db = await createTestDb();
    admin = await createAuthUser(db, "dono@empresa.com");
    tenant = await asUser(db, admin, async () => {
      const r = await db.query<{ id: string }>("select public.create_tenant('Empresa', null, 'Ana Dona') as id");
      return r.rows[0].id;
    });
    await asUser(db, admin, async () => {
      await db.query(
        "insert into public.invitations (tenant_id, email, full_name, role) values ($1, 'gestor@e.com', 'Gil', 'gestor'), ($1, 'carla@e.com', 'Carla', 'colaborador')",
        [tenant],
      );
    });
    gestor = await createAuthUser(db, "gestor@e.com");
    colaborador = await createAuthUser(db, "carla@e.com");

    const ids = await asUser(db, gestor, async () => {
      const contabil = await db.query<{ id: string }>(
        "insert into public.areas (tenant_id, name) values ($1, 'Contábil') returning id",
        [tenant],
      );
      const consultoria = await db.query<{ id: string }>(
        "insert into public.areas (tenant_id, name) values ($1, 'Consultoria') returning id",
        [tenant],
      );
      const apuracao = await db.query<{ id: string }>(
        "insert into public.activities (tenant_id, area_id, name, billable) values ($1, $2, 'Apuração', true) returning id",
        [tenant, contabil.rows[0].id],
      );
      const reuniao = await db.query<{ id: string }>(
        "insert into public.activities (tenant_id, area_id, name, billable) values ($1, $2, 'Reunião', false) returning id",
        [tenant, consultoria.rows[0].id],
      );
      const client = await db.query<{ id: string }>(
        "insert into public.clients (tenant_id, legal_name, trade_name) values ($1, 'Cliente Um LTDA', 'Um') returning id",
        [tenant],
      );
      const contract = await db.query<{ id: string }>(
        `insert into public.contracts (tenant_id, client_id, name, amount, periodicity, start_date, desired_margin)
         values ($1, $2, 'Mensal', 10000, 'mensal', '2026-01-01', 30) returning id`,
        [tenant, client.rows[0].id],
      );
      const carla = await db.query<{ id: string }>("select id from public.employees where full_name = 'Carla'");
      return {
        apuracao: apuracao.rows[0].id,
        reuniao: reuniao.rows[0].id,
        contractId: contract.rows[0].id,
        carlaId: carla.rows[0].id,
      };
    });
    carlaId = ids.carlaId;

    await asUser(db, admin, () =>
      db.query("select public.set_employee_cost($1, 16800, 0, 0, 0, 168, '2026-01-01')", [carlaId]),
    );

    await asUser(db, colaborador, () =>
      db.query(
        `insert into public.time_entries (tenant_id, employee_id, contract_id, activity_id, entry_date, minutes)
         values ($1, $2, $3, $4, '2026-03-02', 600), ($1, $2, $3, $5, '2026-03-03', 300)`,
        [tenant, carlaId, ids.contractId, ids.apuracao, ids.reuniao],
      ),
    );
  }, 60_000);

  it("agrupa horas e custo por área", async () => {
    const r = await asUser(db, gestor, () =>
      db.query<{ area_name: string; hours: string; labor_cost: string }>(
        "select * from public.contract_area_hours('2026-03-01', '2026-03-31') order by area_name",
      ),
    );
    expect(r.rows.map((x) => [x.area_name, Number(x.hours), Number(x.labor_cost)])).toEqual([
      ["Consultoria", 5, 500],
      ["Contábil", 10, 1000],
    ]);
  });

  it("mostra o custo por atividade e o que é faturável", async () => {
    const r = await asUser(db, gestor, () =>
      db.query<{ activity_name: string; billable: boolean; labor_cost: string }>(
        "select * from public.activity_metrics('2026-03-01', '2026-03-31') order by activity_name",
      ),
    );
    expect(r.rows.map((x) => [x.activity_name, x.billable, Number(x.labor_cost)])).toEqual([
      ["Apuração", true, 1000],
      ["Reunião", false, 500],
    ]);
  });

  it("mostra o custo alocado por colaborador em cada cliente", async () => {
    const r = await asUser(db, gestor, () =>
      db.query<{ employee_name: string; client_name: string; hours: string; labor_cost: string }>(
        "select * from public.employee_client_cost('2026-03-01', '2026-03-31')",
      ),
    );
    expect(r.rows).toHaveLength(1);
    expect([r.rows[0].employee_name, r.rows[0].client_name, Number(r.rows[0].labor_cost)]).toEqual([
      "Carla",
      "Um",
      1500,
    ]);
  });

  it("aponta colaboradores ativos sem custo cadastrado", async () => {
    const r = await asUser(db, gestor, () =>
      db.query<{ employee_name: string }>("select * from public.employees_missing_cost() order by employee_name"),
    );
    // Todo usuário com login também é colaborador: a dona e o gestor ainda
    // não têm custo cadastrado; a Carla tem.
    expect(r.rows.map((x) => x.employee_name)).toEqual(["Ana Dona", "Gil"]);
  });

  it("colaborador não acessa nenhuma dessas agregações", async () => {
    for (const sql of [
      "select * from public.contract_area_hours('2026-03-01', '2026-03-31')",
      "select * from public.activity_metrics('2026-03-01', '2026-03-31')",
      "select * from public.employee_client_cost('2026-03-01', '2026-03-31')",
      "select * from public.employees_missing_cost()",
    ]) {
      const r = await asUser(db, colaborador, () => db.query(sql));
      expect(r.rows).toHaveLength(0);
    }
  });
});
