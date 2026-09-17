import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDb, expectError } from "./helpers/db";

describe("contratos e gastos extras", () => {
  let db: PGlite;
  let admin: string;
  let gestor: string;
  let colaborador: string;
  let tenant: string;
  let clientId: string;
  let mensalId: string;
  let trimestralId: string;
  let projetoId: string;

  const revenue = async (contractId: string, from: string, to: string) => {
    const r = await db.query<{ v: string }>("select private.contract_revenue($1, $2, $3) as v", [contractId, from, to]);
    return Number(r.rows[0].v);
  };

  beforeAll(async () => {
    db = await createTestDb();
    admin = await createAuthUser(db, "dono@empresa.com");
    tenant = await asUser(db, admin, async () => {
      const r = await db.query<{ id: string }>("select public.create_tenant('Empresa', null, 'Ana Dona') as id");
      return r.rows[0].id;
    });

    await asUser(db, admin, async () => {
      await db.query(
        "insert into public.invitations (tenant_id, email, full_name, role) values ($1, 'gestor@empresa.com', 'Gil', 'gestor')",
        [tenant],
      );
      await db.query(
        "insert into public.invitations (tenant_id, email, full_name, role) values ($1, 'colab@empresa.com', 'Carla', 'colaborador')",
        [tenant],
      );
    });
    gestor = await createAuthUser(db, "gestor@empresa.com");
    colaborador = await createAuthUser(db, "colab@empresa.com");

    ({ clientId, mensalId, trimestralId, projetoId } = await asUser(db, gestor, async () => {
      const c = await db.query<{ id: string }>(
        "insert into public.clients (tenant_id, legal_name) values ($1, 'Cliente Um') returning id",
        [tenant],
      );
      const clientId = c.rows[0].id;
      const insert = async (sql: string, params: unknown[]) =>
        (await db.query<{ id: string }>(sql, params)).rows[0].id;

      const mensalId = await insert(
        `insert into public.contracts (tenant_id, client_id, name, amount, periodicity, start_date, desired_margin, tax_rate)
         values ($1, $2, 'Contábil mensal', 3000, 'mensal', '2026-01-01', 30, 6) returning id`,
        [tenant, clientId],
      );
      const trimestralId = await insert(
        `insert into public.contracts (tenant_id, client_id, name, amount, periodicity, start_date, desired_margin)
         values ($1, $2, 'Consultoria trimestral', 9000, 'trimestral', '2026-01-01', 25) returning id`,
        [tenant, clientId],
      );
      const projetoId = await insert(
        `insert into public.contracts (tenant_id, client_id, name, amount, periodicity, start_date, end_date, desired_margin)
         values ($1, $2, 'Implantação', 60000, 'projeto', '2026-01-01', '2026-06-30', 35) returning id`,
        [tenant, clientId],
      );
      return { clientId, mensalId, trimestralId, projetoId };
    }));
  }, 60_000);

  it("projeto fechado exige data de término", async () => {
    const msg = await asUser(db, gestor, () =>
      expectError(
        db.query(
          `insert into public.contracts (tenant_id, client_id, name, amount, periodicity, start_date)
           values ($1, $2, 'Sem fim', 1000, 'projeto', '2026-01-01')`,
          [tenant, clientId],
        ),
      ),
    );
    expect(msg).toContain("contracts_project_end_date_check");
  });

  it("normaliza a receita do contrato trimestral para o mês", async () => {
    // R$ 9.000 por trimestre = R$ 3.000 por mês
    expect(await revenue(trimestralId, "2026-02-01", "2026-02-28")).toBeCloseTo(3000, 2);
    expect(await revenue(trimestralId, "2026-01-01", "2026-03-31")).toBeCloseTo(9000, 2);
  });

  it("normaliza a receita do contrato mensal", async () => {
    expect(await revenue(mensalId, "2026-02-01", "2026-02-28")).toBeCloseTo(3000, 2);
    expect(await revenue(mensalId, "2026-01-01", "2026-06-30")).toBeCloseTo(18000, 2);
    // Meio mês ≈ metade da receita
    expect(await revenue(mensalId, "2026-04-01", "2026-04-15")).toBeCloseTo(1500, 2);
  });

  it("distribui o projeto fechado proporcionalmente aos dias", async () => {
    // 60.000 em 181 dias (01/01 a 30/06)
    expect(await revenue(projetoId, "2026-01-01", "2026-06-30")).toBeCloseTo(60000, 2);
    expect(await revenue(projetoId, "2026-03-01", "2026-03-31")).toBeCloseTo((60000 * 31) / 181, 2);
    // Fora da vigência não gera receita
    expect(await revenue(projetoId, "2026-07-01", "2026-07-31")).toBe(0);
  });

  it("considera apenas a vigência do contrato dentro do período", async () => {
    // Contrato começa em 01/01; janeiro inteiro consultado em dezembro/janeiro
    expect(await revenue(mensalId, "2025-12-01", "2026-01-31")).toBeCloseTo(3000, 2);
  });

  it("soma gastos pontuais e normaliza recorrentes", async () => {
    await asUser(db, gestor, async () => {
      await db.query(
        `insert into public.contract_expenses (tenant_id, contract_id, description, category, amount, expense_date, recurrence)
         values ($1, $2, 'Passagens', 'deslocamento', 800, '2026-02-10', 'pontual')`,
        [tenant, mensalId],
      );
      await db.query(
        `insert into public.contract_expenses (tenant_id, contract_id, description, category, amount, expense_date, recurrence)
         values ($1, $2, 'Licença anual', 'software', 1200, '2026-01-01', 'anual')`,
        [tenant, mensalId],
      );
    });

    const fev = await db.query<{ v: string }>(
      "select private.contract_expenses_total($1, '2026-02-01', '2026-02-28') as v",
      [mensalId],
    );
    // 800 (pontual) + 1200/12 (anual normalizada para 1 mês) = 900
    expect(Number(fev.rows[0].v)).toBeCloseTo(900, 2);

    const mar = await db.query<{ v: string }>(
      "select private.contract_expenses_total($1, '2026-03-01', '2026-03-31') as v",
      [mensalId],
    );
    expect(Number(mar.rows[0].v)).toBeCloseTo(100, 2);
  });

  it("gasto pontual não aceita fim de recorrência", async () => {
    const msg = await asUser(db, gestor, () =>
      expectError(
        db.query(
          `insert into public.contract_expenses (tenant_id, contract_id, description, amount, expense_date, recurrence, end_date)
           values ($1, $2, 'Errado', 100, '2026-01-01', 'pontual', '2026-02-01')`,
          [tenant, mensalId],
        ),
      ),
    );
    expect(msg).toContain("contract_expenses_recurrence_check");
  });

  it("colaborador não vê valores de contrato nem gastos", async () => {
    const contracts = await asUser(db, colaborador, () => db.query("select * from public.contracts"));
    expect(contracts.rows).toHaveLength(0);

    const expenses = await asUser(db, colaborador, () => db.query("select * from public.contract_expenses"));
    expect(expenses.rows).toHaveLength(0);

    const msg = await asUser(db, colaborador, () =>
      expectError(
        db.query(
          `insert into public.contracts (tenant_id, client_id, name, amount, start_date)
           values ($1, $2, 'Meu contrato', 1, '2026-01-01')`,
          [tenant, clientId],
        ),
      ),
    );
    expect(msg).toContain("row-level security");
  });

  it("colaborador enxerga apenas nome e status pela view de apontamento", async () => {
    const options = await asUser(db, colaborador, () =>
      db.query<{ name: string }>("select * from public.contract_options order by name"),
    );
    expect(options.rows.map((o) => o.name)).toEqual(["Consultoria trimestral", "Contábil mensal", "Implantação"]);
    const cols = Object.keys(options.rows[0]);
    expect(cols).not.toContain("amount");
    expect(cols).not.toContain("desired_margin");
  });

  it("a view não vaza contratos de outra empresa", async () => {
    const outro = await createAuthUser(db, "dono@empresa-b.com");
    await asUser(db, outro, () => db.query("select public.create_tenant('Empresa B', null, 'Bruno')"));
    const options = await asUser(db, outro, () => db.query("select * from public.contract_options"));
    expect(options.rows).toHaveLength(0);
  });

  it("vincula áreas, atividades e colaboradores ao contrato", async () => {
    await asUser(db, gestor, async () => {
      const area = await db.query<{ id: string }>(
        "insert into public.areas (tenant_id, name) values ($1, 'Consultoria') returning id",
        [tenant],
      );
      const activity = await db.query<{ id: string }>(
        "insert into public.activities (tenant_id, area_id, name) values ($1, $2, 'Reunião de diagnóstico') returning id",
        [tenant, area.rows[0].id],
      );
      const employee = await db.query<{ id: string }>(
        "select id from public.employees where full_name = 'Carla'",
      );
      await db.query("insert into public.contract_areas (tenant_id, contract_id, area_id) values ($1, $2, $3)", [
        tenant,
        mensalId,
        area.rows[0].id,
      ]);
      await db.query(
        "insert into public.contract_activities (tenant_id, contract_id, activity_id) values ($1, $2, $3)",
        [tenant, mensalId, activity.rows[0].id],
      );
      await db.query("insert into public.contract_members (tenant_id, contract_id, employee_id) values ($1, $2, $3)", [
        tenant,
        mensalId,
        employee.rows[0].id,
      ]);
    });

    const members = await asUser(db, colaborador, () => db.query("select * from public.contract_members"));
    expect(members.rows).toHaveLength(1);

    const msg = await asUser(db, colaborador, () =>
      expectError(
        db.query("delete from public.contract_members where contract_id = $1", [mensalId]).then(async (r) => {
          if (r.affectedRows === 0) throw new Error("row-level security: nenhuma linha afetada");
          return r;
        }),
      ),
    );
    expect(msg).toContain("row-level security");
  });
});
