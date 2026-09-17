import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDb, expectError } from "./helpers/db";
import { computeProfitability, type ContractMetricsRow } from "../../src/lib/profitability";

/**
 * Cenário completo: contrato mensal de R$ 10.000 com 6% de impostos,
 * duas pessoas apontando em março e um gasto extra recorrente.
 */
describe("motor de rentabilidade (banco + serviço)", () => {
  let db: PGlite;
  let admin: string;
  let gestor: string;
  let colaborador: string;
  let tenant: string;
  let contractId: string;

  const metrics = async (user: string, from: string, to: string) => {
    const r = await asUser(db, user, () =>
      db.query<ContractMetricsRow>("select * from public.contract_metrics($1, $2)", [from, to]),
    );
    return r.rows;
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
        "insert into public.invitations (tenant_id, email, full_name, role) values ($1, 'gestor@e.com', 'Gil Gestor', 'gestor')",
        [tenant],
      );
      await db.query(
        "insert into public.invitations (tenant_id, email, full_name, role) values ($1, 'carla@e.com', 'Carla', 'colaborador')",
        [tenant],
      );
      await db.query(
        "insert into public.invitations (tenant_id, email, full_name, role) values ($1, 'bruno@e.com', 'Bruno', 'colaborador')",
        [tenant],
      );
    });
    gestor = await createAuthUser(db, "gestor@e.com");
    colaborador = await createAuthUser(db, "carla@e.com");
    const bruno = await createAuthUser(db, "bruno@e.com");

    const ids = await asUser(db, gestor, async () => {
      const area = await db.query<{ id: string }>(
        "insert into public.areas (tenant_id, name) values ($1, 'Contábil') returning id",
        [tenant],
      );
      const activity = await db.query<{ id: string }>(
        "insert into public.activities (tenant_id, area_id, name, billable) values ($1, $2, 'Apuração', true) returning id",
        [tenant, area.rows[0].id],
      );
      const interna = await db.query<{ id: string }>(
        "insert into public.activities (tenant_id, area_id, name, billable) values ($1, $2, 'Interna', false) returning id",
        [tenant, area.rows[0].id],
      );
      const client = await db.query<{ id: string }>(
        "insert into public.clients (tenant_id, legal_name, trade_name) values ($1, 'Cliente Um LTDA', 'Um') returning id",
        [tenant],
      );
      const contract = await db.query<{ id: string }>(
        `insert into public.contracts (tenant_id, client_id, name, amount, periodicity, start_date, desired_margin, tax_rate)
         values ($1, $2, 'Contábil mensal', 10000, 'mensal', '2026-01-01', 30, 6) returning id`,
        [tenant, client.rows[0].id],
      );
      const employees = await db.query<{ id: string; full_name: string }>(
        "select id, full_name from public.employees where tenant_id = $1",
        [tenant],
      );
      return {
        contractId: contract.rows[0].id,
        activityId: activity.rows[0].id,
        internaId: interna.rows[0].id,
        carlaId: employees.rows.find((e) => e.full_name === "Carla")!.id,
        brunoId: employees.rows.find((e) => e.full_name === "Bruno")!.id,
      };
    });
    contractId = ids.contractId;

    // Custo hora: Carla R$ 100 (16.800/168), Bruno R$ 50
    await asUser(db, admin, async () => {
      await db.query("select public.set_employee_cost($1, 16800, 0, 0, 0, 168, '2026-01-01')", [ids.carlaId]);
      await db.query("select public.set_employee_cost($1, 8400, 0, 0, 0, 168, '2026-01-01')", [ids.brunoId]);
      // Equipe alocada ao contrato
      await db.query(
        "insert into public.contract_members (tenant_id, contract_id, employee_id) values ($1, $2, $3), ($1, $2, $4)",
        [tenant, contractId, ids.carlaId, ids.brunoId],
      );
      // Gasto recorrente mensal de R$ 500 + pontual de R$ 300 em março
      await db.query(
        `insert into public.contract_expenses (tenant_id, contract_id, description, category, amount, expense_date, recurrence)
         values ($1, $2, 'Software', 'software', 500, '2026-01-01', 'mensal'),
                ($1, $2, 'Viagem', 'deslocamento', 300, '2026-03-10', 'pontual')`,
        [tenant, contractId],
      );
    });

    // Março: Carla 30h faturáveis (4 dias) + 5h internas; Bruno 20h faturáveis
    await asUser(db, colaborador, () =>
      db.query(
        `insert into public.time_entries (tenant_id, employee_id, contract_id, activity_id, entry_date, minutes)
         values ($1, $2, $3, $4, '2026-03-02', 450),
                ($1, $2, $3, $4, '2026-03-03', 450),
                ($1, $2, $3, $4, '2026-03-04', 450),
                ($1, $2, $3, $4, '2026-03-05', 450),
                ($1, $2, $3, $5, '2026-03-06', 300)`,
        [tenant, ids.carlaId, contractId, ids.activityId, ids.internaId],
      ),
    );
    await asUser(db, bruno, () =>
      db.query(
        `insert into public.time_entries (tenant_id, employee_id, contract_id, activity_id, entry_date, minutes)
         values ($1, $2, $3, $4, '2026-03-09', 400),
                ($1, $2, $3, $4, '2026-03-10', 400),
                ($1, $2, $3, $4, '2026-03-11', 400)`,
        [tenant, ids.brunoId, contractId, ids.activityId],
      ),
    );
    // Rejeitado não entra no custo
    await asUser(db, colaborador, () =>
      db.query(
        `insert into public.time_entries (tenant_id, employee_id, contract_id, activity_id, entry_date, minutes, description)
         values ($1, $2, $3, $4, '2026-03-12', 480, 'duplicado')`,
        [tenant, ids.carlaId, contractId, ids.activityId],
      ),
    );
    await asUser(db, gestor, () =>
      db.query(
        "select public.review_time_entries(array(select id from public.time_entries where description = 'duplicado'), 'rejeitado')",
      ),
    );
  }, 60_000);

  it("agrega receita, horas, custo de horas e gastos do período", async () => {
    const [row] = await metrics(gestor, "2026-03-01", "2026-03-31");
    expect(row.client_name).toBe("Um");
    expect(Number(row.revenue)).toBeCloseTo(10000, 2);
    expect(Number(row.hours)).toBeCloseTo(55, 4); // 30 + 5 + 20 (rejeitado fora)
    expect(Number(row.billable_hours)).toBeCloseTo(50, 4);
    // 35h da Carla × 100 + 20h do Bruno × 50 = 4.500
    expect(Number(row.labor_cost)).toBeCloseTo(4500, 2);
    // 500 recorrente do mês + 300 pontual
    expect(Number(row.expense_cost)).toBeCloseTo(800, 2);
    // Média da equipe alocada: (100 + 50) ÷ 2
    expect(Number(row.team_cost_per_hour)).toBeCloseTo(75, 4);
    expect(Number(row.entries_count)).toBe(8); // o rejeitado não conta
  });

  it("os indicadores derivados batem com o esperado", async () => {
    const [row] = await metrics(gestor, "2026-03-01", "2026-03-31");
    const p = computeProfitability(row, { attentionTolerancePoints: 10 });

    expect(p.taxAmount).toBeCloseTo(600, 2); // 6% de 10.000
    expect(p.netRevenue).toBeCloseTo(9400, 2);
    expect(p.totalCost).toBeCloseTo(5300, 2); // 4.500 + 800
    expect(p.profit).toBeCloseTo(4100, 2);
    expect(p.realMargin!).toBeCloseTo(4100 / 9400, 6); // ≈ 43,6%
    expect(p.status).toBe("saudavel");
    expect(p.effectiveHourlyRate!).toBeCloseTo(9400 / 55, 4);
    // (9.400 × 0,7 − 800) ÷ 75 = 77,07 horas
    expect(p.hoursLimit!).toBeCloseTo((9400 * 0.7 - 800) / 75, 4);
    expect(p.hoursConsumption!).toBeCloseTo(55 / p.hoursLimit!, 6);
  });

  it("período sem apontamentos zera custo mas mantém receita", async () => {
    const [row] = await metrics(gestor, "2026-04-01", "2026-04-30");
    expect(Number(row.revenue)).toBeCloseTo(10000, 2);
    expect(Number(row.hours)).toBe(0);
    expect(Number(row.labor_cost)).toBe(0);
    expect(Number(row.expense_cost)).toBeCloseTo(500, 2); // só o recorrente
  });

  it("detalha horas por colaborador, atividade e área", async () => {
    const r = await asUser(db, gestor, () =>
      db.query<{ employee_name: string; activity_name: string; area_name: string; hours: string; labor_cost: string }>(
        "select * from public.contract_hours_breakdown($1, '2026-03-01', '2026-03-31') order by employee_name, activity_name",
        [contractId],
      ),
    );
    expect(r.rows.map((x) => [x.employee_name, x.activity_name, Number(x.hours)])).toEqual([
      ["Bruno", "Apuração", 20],
      ["Carla", "Apuração", 30],
      ["Carla", "Interna", 5],
    ]);
    expect(r.rows.every((x) => x.area_name === "Contábil")).toBe(true);
  });

  it("mede utilização e horas faturáveis por colaborador", async () => {
    const r = await asUser(db, gestor, () =>
      db.query<{ employee_name: string; available_hours: string; hours: string; billable_hours: string; last_entry_date: Date | null }>(
        "select * from public.employee_metrics('2026-03-01', '2026-03-31') order by employee_name",
      ),
    );
    const carla = r.rows.find((x) => x.employee_name === "Carla")!;
    expect(Number(carla.available_hours)).toBeCloseTo(168, 2); // jornada padrão em 1 mês
    expect(Number(carla.hours)).toBeCloseTo(35, 4);
    expect(Number(carla.billable_hours)).toBeCloseTo(30, 4);
    expect(carla.last_entry_date?.toISOString().slice(0, 10)).toBe("2026-03-06");

    const ana = r.rows.find((x) => x.employee_name === "Ana Dona")!;
    expect(Number(ana.hours)).toBe(0);
  });

  it("colaborador não acessa os números de rentabilidade", async () => {
    const rows = await metrics(colaborador, "2026-03-01", "2026-03-31");
    expect(rows).toHaveLength(0);

    const breakdown = await asUser(db, colaborador, () =>
      db.query("select * from public.contract_hours_breakdown($1, '2026-03-01', '2026-03-31')", [contractId]),
    );
    expect(breakdown.rows).toHaveLength(0);

    const employees = await asUser(db, colaborador, () =>
      db.query("select * from public.employee_metrics('2026-03-01', '2026-03-31')"),
    );
    expect(employees.rows).toHaveLength(0);
  });

  it("colaborador vê as próprias horas, sem custo", async () => {
    const r = await asUser(db, colaborador, () =>
      db.query<{ activity_name: string; hours: string; billable: boolean; client_name: string }>(
        "select * from public.my_hours_breakdown('2026-03-01', '2026-03-31') order by activity_name",
      ),
    );
    // A função devolve por dia; aqui somamos por atividade
    const porAtividade = new Map<string, number>();
    for (const row of r.rows) {
      porAtividade.set(row.activity_name, (porAtividade.get(row.activity_name) ?? 0) + Number(row.hours));
    }
    expect([...porAtividade.entries()].sort()).toEqual([
      ["Apuração", 30],
      ["Interna", 5],
    ]);
    expect(Object.keys(r.rows[0])).not.toContain("labor_cost");
  });

  it("não vaza métricas de outra empresa", async () => {
    const outro = await createAuthUser(db, "dono@b.com");
    await asUser(db, outro, () => db.query("select public.create_tenant('Empresa B', null, 'Bruno B')"));
    const rows = await metrics(outro, "2026-03-01", "2026-03-31");
    expect(rows).toHaveLength(0);
  });

  it("aumento salarial não muda o custo de períodos já apontados", async () => {
    const antes = (await metrics(gestor, "2026-03-01", "2026-03-31"))[0];
    const carlaId = (await db.query<{ id: string }>("select id from public.employees where full_name = 'Carla'"))
      .rows[0].id;
    await asUser(db, admin, () =>
      db.query("select public.set_employee_cost($1, 33600, 0, 0, 0, 168, '2026-04-01')", [carlaId]),
    );
    const depois = (await metrics(gestor, "2026-03-01", "2026-03-31"))[0];
    expect(Number(depois.labor_cost)).toBeCloseTo(Number(antes.labor_cost), 4);
    // Mas a média da equipe alocada olha o custo vigente da data de referência
    const abril = (await metrics(gestor, "2026-04-01", "2026-04-30"))[0];
    expect(Number(abril.team_cost_per_hour)).toBeCloseTo(125, 4); // (200 + 50) ÷ 2
  });

  it("gestor sem permissão de ver custos ainda enxerga a rentabilidade", async () => {
    const r = await metrics(gestor, "2026-03-01", "2026-03-31");
    expect(Number(r[0].labor_cost)).toBeGreaterThan(0);
    // ...mas continua sem acesso aos salários individuais
    const costs = await asUser(db, gestor, () => db.query("select * from public.employee_costs"));
    expect(costs.rows).toHaveLength(0);
  });

  it("funções de métrica não são acessíveis anonimamente", async () => {
    const msg = await expectError(
      (async () => {
        await db.exec("set role anon;");
        try {
          return await db.query("select * from public.contract_metrics('2026-03-01', '2026-03-31')");
        } finally {
          await db.exec("reset role;");
        }
      })(),
    );
    expect(msg).toContain("permission denied");
  });
});
