import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDb, expectError } from "./helpers/db";

describe("atividade obrigatoriamente dentro de uma área + exclusão segura", () => {
  let db: PGlite;
  let admin: string;
  let gestor: string;
  let tenant: string;

  beforeAll(async () => {
    db = await createTestDb();
    admin = await createAuthUser(db, "dono@empresa.com");
    tenant = await asUser(db, admin, async () => {
      const r = await db.query<{ id: string }>("select public.create_tenant('Empresa', null, 'Ana Dona') as id");
      return r.rows[0].id;
    });
    await asUser(db, admin, () =>
      db.query(
        "insert into public.invitations (tenant_id, email, full_name, role) values ($1, 'gestor@e.com', 'Gil', 'gestor')",
        [tenant],
      ),
    );
    gestor = await createAuthUser(db, "gestor@e.com");
  }, 60_000);

  it("não aceita atividade sem área", async () => {
    const msg = await asUser(db, gestor, () =>
      expectError(db.query("insert into public.activities (tenant_id, name) values ($1, 'Sem área')", [tenant])),
    );
    expect(msg).toContain("null value in column");
  });

  it("não permite excluir área com atividades vinculadas", async () => {
    const area = await asUser(db, gestor, async () => {
      const r = await db.query<{ id: string }>(
        "insert into public.areas (tenant_id, name) values ($1, 'Fiscal') returning id",
        [tenant],
      );
      await db.query("insert into public.activities (tenant_id, area_id, name) values ($1, $2, 'Apuração')", [
        tenant,
        r.rows[0].id,
      ]);
      return r.rows[0].id;
    });

    const msg = await asUser(db, gestor, () =>
      expectError(db.query("delete from public.areas where id = $1", [area])),
    );
    expect(msg).toContain("foreign key");
  });

  it("exclui área sem nenhuma atividade vinculada", async () => {
    const area = await asUser(db, gestor, async () => {
      const r = await db.query<{ id: string }>(
        "insert into public.areas (tenant_id, name) values ($1, 'Vazia') returning id",
        [tenant],
      );
      return r.rows[0].id;
    });

    const r = await asUser(db, gestor, () => db.query("delete from public.areas where id = $1", [area]));
    expect(r.affectedRows).toBe(1);
  });

  it("não permite excluir atividade com apontamentos (regra já existente)", async () => {
    const { areaId, activityId, employeeId } = await asUser(db, gestor, async () => {
      const area = await db.query<{ id: string }>(
        "insert into public.areas (tenant_id, name) values ($1, 'Contábil') returning id",
        [tenant],
      );
      const activity = await db.query<{ id: string }>(
        "insert into public.activities (tenant_id, area_id, name) values ($1, $2, 'Escrituração') returning id",
        [tenant, area.rows[0].id],
      );
      const employee = await db.query<{ id: string }>("select id from public.employees where tenant_id = $1 limit 1", [
        tenant,
      ]);
      return { areaId: area.rows[0].id, activityId: activity.rows[0].id, employeeId: employee.rows[0].id };
    });

    await asUser(db, admin, () =>
      db.query(
        "insert into public.time_entries (tenant_id, employee_id, activity_id, entry_date, minutes) values ($1, $2, $3, '2026-01-05', 60)",
        [tenant, employeeId, activityId],
      ),
    );

    const msg = await asUser(db, gestor, () =>
      expectError(db.query("delete from public.activities where id = $1", [activityId])),
    );
    expect(msg).toContain("foreign key");

    // A área continua bloqueada por tabela, mesmo que só via a atividade
    const msgArea = await asUser(db, gestor, () =>
      expectError(db.query("delete from public.areas where id = $1", [areaId])),
    );
    expect(msgArea).toContain("foreign key");
  });

  it("exclui atividade sem nenhum apontamento", async () => {
    const activityId = await asUser(db, gestor, async () => {
      const area = await db.query<{ id: string }>(
        "insert into public.areas (tenant_id, name) values ($1, 'Consultoria2') returning id",
        [tenant],
      );
      const activity = await db.query<{ id: string }>(
        "insert into public.activities (tenant_id, area_id, name) values ($1, $2, 'Reunião X') returning id",
        [tenant, area.rows[0].id],
      );
      return activity.rows[0].id;
    });

    const r = await asUser(db, gestor, () => db.query("delete from public.activities where id = $1", [activityId]));
    expect(r.affectedRows).toBe(1);
  });

  it("não permite excluir cliente com contrato (evita perder histórico em cascata)", async () => {
    const clientId = await asUser(db, gestor, async () => {
      const client = await db.query<{ id: string }>(
        "insert into public.clients (tenant_id, legal_name) values ($1, 'Cliente Com Contrato') returning id",
        [tenant],
      );
      await db.query(
        `insert into public.contracts (tenant_id, client_id, name, amount, periodicity, start_date, desired_margin)
         values ($1, $2, 'Mensal', 1000, 'mensal', '2026-01-01', 30)`,
        [tenant, client.rows[0].id],
      );
      return client.rows[0].id;
    });

    const msg = await asUser(db, gestor, () =>
      expectError(db.query("delete from public.clients where id = $1", [clientId])),
    );
    expect(msg).toContain("foreign key");

    // Continua ativo — nada foi apagado em cascata
    const r = await db.query("select * from public.contracts where client_id = $1", [clientId]);
    expect(r.rows).toHaveLength(1);
  });

  it("exclui cliente sem nenhum contrato", async () => {
    const clientId = await asUser(db, gestor, async () => {
      const r = await db.query<{ id: string }>(
        "insert into public.clients (tenant_id, legal_name) values ($1, 'Cliente Sem Contrato') returning id",
        [tenant],
      );
      return r.rows[0].id;
    });

    const r = await asUser(db, gestor, () => db.query("delete from public.clients where id = $1", [clientId]));
    expect(r.affectedRows).toBe(1);
  });
});
