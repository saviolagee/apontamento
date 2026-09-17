import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDb, expectError } from "./helpers/db";

describe("apontamento de horas, aprovação e fechamento", () => {
  let db: PGlite;
  let admin: string;
  let gestor: string;
  let colaborador: string;
  let outroColab: string;
  let tenant: string;
  let contractId: string;
  let activityId: string;
  let naoFaturavelId: string;
  let carlaId: string;

  const entryId = async (desc: string) =>
    (await db.query<{ id: string }>("select id from public.time_entries where description = $1", [desc])).rows[0].id;

  beforeAll(async () => {
    db = await createTestDb();
    admin = await createAuthUser(db, "dono@empresa.com");
    tenant = await asUser(db, admin, async () => {
      const r = await db.query<{ id: string }>("select public.create_tenant('Empresa', null, 'Ana Dona') as id");
      return r.rows[0].id;
    });

    await asUser(db, admin, async () => {
      for (const [email, name, role] of [
        ["gestor@empresa.com", "Gil Gestor", "gestor"],
        ["carla@empresa.com", "Carla Colab", "colaborador"],
        ["bruno@empresa.com", "Bruno Colab", "colaborador"],
      ]) {
        await db.query(
          "insert into public.invitations (tenant_id, email, full_name, role) values ($1, $2, $3, $4)",
          [tenant, email, name, role],
        );
      }
    });
    gestor = await createAuthUser(db, "gestor@empresa.com");
    colaborador = await createAuthUser(db, "carla@empresa.com");
    outroColab = await createAuthUser(db, "bruno@empresa.com");

    ({ contractId, activityId, naoFaturavelId, carlaId } = await asUser(db, gestor, async () => {
      const area = await db.query<{ id: string }>(
        "insert into public.areas (tenant_id, name) values ($1, 'Contábil') returning id",
        [tenant],
      );
      const act = await db.query<{ id: string }>(
        "insert into public.activities (tenant_id, area_id, name, billable) values ($1, $2, 'Apuração', true) returning id",
        [tenant, area.rows[0].id],
      );
      const interna = await db.query<{ id: string }>(
        "insert into public.activities (tenant_id, area_id, name, billable) values ($1, $2, 'Reunião interna', false) returning id",
        [tenant, area.rows[0].id],
      );
      const client = await db.query<{ id: string }>(
        "insert into public.clients (tenant_id, legal_name) values ($1, 'Cliente Um') returning id",
        [tenant],
      );
      const contract = await db.query<{ id: string }>(
        `insert into public.contracts (tenant_id, client_id, name, amount, periodicity, start_date, desired_margin)
         values ($1, $2, 'Contábil mensal', 3000, 'mensal', '2026-01-01', 30) returning id`,
        [tenant, client.rows[0].id],
      );
      const carla = await db.query<{ id: string }>("select id from public.employees where full_name = 'Carla Colab'");
      return {
        contractId: contract.rows[0].id,
        activityId: act.rows[0].id,
        naoFaturavelId: interna.rows[0].id,
        carlaId: carla.rows[0].id,
      };
    }));

    // Custo hora da Carla: (8000 + 80% + 600) / 168 = 89,2857
    await asUser(db, admin, () =>
      db.query("select public.set_employee_cost($1, 8000, 80, 0, 600, 168, '2026-01-01')", [carlaId]),
    );
  }, 60_000);

  it("grava o custo hora vigente e o custo do apontamento", async () => {
    await asUser(db, colaborador, () =>
      db.query(
        `insert into public.time_entries (tenant_id, employee_id, contract_id, activity_id, entry_date, minutes, description)
         values ($1, $2, $3, $4, '2026-02-10', 120, 'Apuração fevereiro')`,
        [tenant, carlaId, contractId, activityId],
      ),
    );
    const r = await db.query<{ cost_per_hour: string; cost_amount: string; billable: boolean; status: string }>(
      "select cost_per_hour, cost_amount, billable, status from public.time_entries where description = 'Apuração fevereiro'",
    );
    expect(Number(r.rows[0].cost_per_hour)).toBeCloseTo(89.2857, 4);
    expect(Number(r.rows[0].cost_amount)).toBeCloseTo(178.5714, 4); // 2h
    expect(r.rows[0].billable).toBe(true);
    expect(r.rows[0].status).toBe("pendente");
  });

  it("calcula a duração a partir do intervalo de horas", async () => {
    await asUser(db, colaborador, () =>
      db.query(
        `insert into public.time_entries (tenant_id, employee_id, contract_id, activity_id, entry_date, start_time, end_time, minutes, description)
         values ($1, $2, $3, $4, '2026-02-11', '09:00', '11:30', 1, 'Com intervalo')`,
        [tenant, carlaId, contractId, activityId],
      ),
    );
    const r = await db.query<{ minutes: number }>(
      "select minutes from public.time_entries where description = 'Com intervalo'",
    );
    expect(r.rows[0].minutes).toBe(150);
  });

  it("herda o faturável da atividade", async () => {
    await asUser(db, colaborador, () =>
      db.query(
        `insert into public.time_entries (tenant_id, employee_id, activity_id, entry_date, minutes, description)
         values ($1, $2, $3, '2026-02-12', 60, 'Interna')`,
        [tenant, carlaId, naoFaturavelId],
      ),
    );
    const r = await db.query<{ billable: boolean; contract_id: string | null }>(
      "select billable, contract_id from public.time_entries where description = 'Interna'",
    );
    expect(r.rows[0].billable).toBe(false);
    expect(r.rows[0].contract_id).toBeNull();
  });

  it("colaborador não lança horas para outra pessoa", async () => {
    const msg = await asUser(db, outroColab, () =>
      expectError(
        db.query(
          `insert into public.time_entries (tenant_id, employee_id, activity_id, entry_date, minutes, description)
           values ($1, $2, $3, '2026-02-13', 60, 'Falso')`,
          [tenant, carlaId, activityId],
        ),
      ),
    );
    expect(msg).toContain("row-level security");
  });

  it("colaborador só enxerga os próprios apontamentos; gestor vê todos", async () => {
    const dela = await asUser(db, colaborador, () => db.query("select * from public.time_entries"));
    expect(dela.rows).toHaveLength(3);

    const dele = await asUser(db, outroColab, () => db.query("select * from public.time_entries"));
    expect(dele.rows).toHaveLength(0);

    const doGestor = await asUser(db, gestor, () => db.query("select * from public.time_entries"));
    expect(doGestor.rows).toHaveLength(3);
  });

  it("colaborador não aprova o próprio apontamento", async () => {
    const id = await entryId("Apuração fevereiro");
    const msg = await asUser(db, colaborador, () =>
      expectError(db.query("update public.time_entries set status = 'aprovado' where id = $1", [id])),
    );
    expect(msg).toContain("Apenas gestores");

    const rpc = await asUser(db, colaborador, () =>
      expectError(db.query("select public.review_time_entries(array[$1]::uuid[], 'aprovado')", [id])),
    );
    expect(rpc).toContain("Apenas gestores");
  });

  it("gestor aprova em lote e registra quem revisou", async () => {
    const id = await entryId("Apuração fevereiro");
    const r = await asUser(db, gestor, () =>
      db.query<{ n: number }>("select public.review_time_entries(array[$1]::uuid[], 'aprovado', 'ok') as n", [id]),
    );
    expect(r.rows[0].n).toBe(1);

    const entry = await db.query<{ status: string; reviewed_by: string; reviewed_at: Date }>(
      "select status, reviewed_by, reviewed_at from public.time_entries where id = $1",
      [id],
    );
    expect(entry.rows[0].status).toBe("aprovado");
    expect(entry.rows[0].reviewed_by).toBe(gestor);
    expect(entry.rows[0].reviewed_at).not.toBeNull();
  });

  it("apontamento aprovado não pode mais ser editado nem excluído pelo colaborador", async () => {
    const id = await entryId("Apuração fevereiro");
    const edit = await asUser(db, colaborador, () =>
      expectError(db.query("update public.time_entries set minutes = 300 where id = $1", [id])),
    );
    expect(edit).toContain("já revisado");

    const del = await asUser(db, colaborador, () =>
      expectError(db.query("delete from public.time_entries where id = $1", [id])),
    );
    expect(del).toContain("já revisado");
  });

  it("colaborador edita e exclui apontamento pendente", async () => {
    const id = await entryId("Com intervalo");
    await asUser(db, colaborador, () =>
      db.query("update public.time_entries set minutes = 90, start_time = null, end_time = null where id = $1", [id]),
    );
    const r = await db.query<{ minutes: number }>("select minutes from public.time_entries where id = $1", [id]);
    expect(r.rows[0].minutes).toBe(90);

    const del = await asUser(db, colaborador, () => db.query("delete from public.time_entries where id = $1", [id]));
    expect(del.affectedRows).toBe(1);
  });

  it("não aceita apontamento já nascendo aprovado", async () => {
    const msg = await asUser(db, gestor, () =>
      expectError(
        db.query(
          `insert into public.time_entries (tenant_id, employee_id, activity_id, entry_date, minutes, status, description)
           values ($1, $2, $3, '2026-02-14', 60, 'aprovado', 'Atalho')`,
          [tenant, carlaId, activityId],
        ),
      ),
    );
    expect(msg).toContain("pendentes");
  });

  describe("fechamento de período", () => {
    it("só admin fecha o período", async () => {
      const msg = await asUser(db, gestor, () =>
        expectError(db.query("select public.set_period_lock('2026-02-28')")),
      );
      expect(msg).toContain("Apenas administradores");
      await asUser(db, admin, () => db.query("select public.set_period_lock('2026-02-28')"));
    });

    it("bloqueia lançar, editar e excluir dentro do período fechado", async () => {
      const novo = await asUser(db, colaborador, () =>
        expectError(
          db.query(
            `insert into public.time_entries (tenant_id, employee_id, activity_id, entry_date, minutes, description)
             values ($1, $2, $3, '2026-02-20', 60, 'Atrasado')`,
            [tenant, carlaId, activityId],
          ),
        ),
      );
      expect(novo).toContain("Período fechado");

      const id = await entryId("Interna");
      const edit = await asUser(db, colaborador, () =>
        expectError(db.query("update public.time_entries set minutes = 30 where id = $1", [id])),
      );
      expect(edit).toContain("Período fechado");

      const del = await asUser(db, colaborador, () =>
        expectError(db.query("delete from public.time_entries where id = $1", [id])),
      );
      expect(del).toContain("Período fechado");
    });

    it("permite lançar depois da data de fechamento", async () => {
      await asUser(db, colaborador, () =>
        db.query(
          `insert into public.time_entries (tenant_id, employee_id, contract_id, activity_id, entry_date, minutes, description)
           values ($1, $2, $3, $4, '2026-03-02', 60, 'Março')`,
          [tenant, carlaId, contractId, activityId],
        ),
      );
      const r = await db.query("select 1 from public.time_entries where description = 'Março'");
      expect(r.rows).toHaveLength(1);
    });

    it("gestor ainda consegue aprovar apontamento de período fechado", async () => {
      const id = await entryId("Interna");
      const r = await asUser(db, gestor, () =>
        db.query<{ n: number }>("select public.review_time_entries(array[$1]::uuid[], 'rejeitado', 'sem contrato') as n", [
          id,
        ]),
      );
      expect(r.rows[0].n).toBe(1);
    });
  });
});
