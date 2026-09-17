import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDb, expectError } from "./helpers/db";
import { runSeed } from "../../scripts/seed-core.mjs";
import { computeProfitability, sumProfitability, type ContractMetricsRow } from "../../src/lib/profitability";
import { resolvePeriod } from "../../src/lib/periods";

/**
 * Roda o seed de verdade contra um Postgres com todas as migrations: garante
 * que os dados de demonstração respeitam triggers, RLS e regras de negócio.
 */
describe("seed de demonstração", () => {
  let db: PGlite;
  let admin: string;
  let summary: {
    tenantId: string;
    createdTenant: boolean;
    clients: number;
    contracts: number;
    employees: number;
    entries: number;
    hours: number;
    lockedThrough: string;
    windowStart: string;
    windowEnd: string;
  };

  beforeAll(async () => {
    db = await createTestDb();
    admin = await createAuthUser(db, "dono@demo.com");
    summary = await runSeed(db, { email: "dono@demo.com", today: "2026-09-17" });
  }, 180_000);

  it("cria a empresa com o volume prometido", () => {
    expect(summary.createdTenant).toBe(true);
    expect(summary.clients).toBe(10);
    expect(summary.contracts).toBe(12);
    expect(summary.employees).toBe(7); // 6 do time + o admin
    expect(summary.entries).toBeGreaterThan(500);
    expect(summary.hours).toBeGreaterThan(2000);
  });

  it("usa contratos de todas as periodicidades", async () => {
    const r = await db.query<{ periodicity: string }>(
      "select distinct periodicity::text as periodicity from public.contracts order by 1",
    );
    expect(r.rows.map((x) => x.periodicity).sort()).toEqual(
      ["anual", "bimestral", "mensal", "projeto", "semestral", "trimestral"].sort(),
    );
  });

  it("todo apontamento saiu com custo hora gravado", async () => {
    const r = await db.query<{ sem_custo: number; zerado: number }>(
      `select
         count(*) filter (where cost_per_hour is null)::int as sem_custo,
         count(*) filter (where cost_amount = 0)::int as zerado
       from public.time_entries`,
    );
    expect(r.rows[0].sem_custo).toBe(0);
    expect(r.rows[0].zerado).toBe(0);
  });

  it("respeita o histórico de custo: o aumento não mexe nos meses anteriores", async () => {
    const r = await db.query<{ mes: string; custo: string }>(
      `select to_char(entry_date, 'YYYY-MM') as mes, max(cost_per_hour)::text as custo
       from public.time_entries t
       join public.employees e on e.id = t.employee_id
       where e.full_name = 'Diego Martins'
       group by 1 order by 1`,
    );
    // 5.200 + 80% + 700 = 10.060 / 168 ≈ 59,88 · depois 6.200 → 11.860 / 168 ≈ 70,60
    expect(Number(r.rows[0].custo)).toBeCloseTo(59.881, 2);
    expect(Number(r.rows.at(-1)!.custo)).toBeCloseTo(70.5952, 2);
  });

  it("deixa o mês atual pendente e os anteriores revisados", async () => {
    const r = await db.query<{ status: string; n: number }>(
      "select status::text as status, count(*)::int as n from public.time_entries group by 1 order by 1",
    );
    const byStatus = Object.fromEntries(r.rows.map((x) => [x.status, x.n]));
    expect(byStatus.aprovado).toBeGreaterThan(0);
    expect(byStatus.pendente).toBeGreaterThan(0);
    expect(byStatus.rejeitado).toBe(4);

    const pendentes = await db.query<{ min: Date }>(
      "select min(entry_date) as min from public.time_entries where status = 'pendente'",
    );
    expect(pendentes.rows[0].min.toISOString().slice(0, 10) >= "2026-09-01").toBe(true);
  });

  it("fecha o período mais antigo e o bloqueio funciona", async () => {
    const lock = await db.query<{ locked_through: Date }>("select locked_through from public.period_locks");
    expect(lock.rows[0].locked_through.toISOString().slice(0, 10)).toBe("2026-07-31");

    const employee = await db.query<{ id: string }>("select id from public.employees limit 1");
    const activity = await db.query<{ id: string }>("select id from public.activities limit 1");
    const msg = await asUser(db, admin, () =>
      expectError(
        db.query(
          `insert into public.time_entries (tenant_id, employee_id, activity_id, entry_date, minutes)
           values ($1, $2, $3, '2026-07-15', 60)`,
          [summary.tenantId, employee.rows[0].id, activity.rows[0].id],
        ),
      ),
    );
    expect(msg).toContain("Período fechado");
  });

  it("o dashboard do mês atual sai com os três status", async () => {
    // Mesmo período que a tela usa por padrão (mês corrente até hoje)
    const period = resolvePeriod("2026-09-17");
    const rows = await asUser(db, admin, async () => {
      const r = await db.query<ContractMetricsRow>("select * from public.contract_metrics($1, $2)", [
        period.from,
        period.to,
      ]);
      return r.rows;
    });
    expect(rows).toHaveLength(12);

    const reports = rows.map((row) => computeProfitability(row, { attentionTolerancePoints: 10 }));
    expect(reports.every((p) => p.revenue > 0)).toBe(true);
    expect(reports.every((p) => p.hours > 0)).toBe(true);

    // A demonstração precisa mostrar contrato saudável, em atenção e crítico
    const statuses = reports.map((p) => p.status);
    expect(statuses.filter((s) => s === "saudavel").length).toBeGreaterThanOrEqual(3);
    expect(statuses.filter((s) => s === "atencao").length).toBeGreaterThanOrEqual(1);
    expect(statuses.filter((s) => s === "critico").length).toBeGreaterThanOrEqual(1);

    // A empresa fecha o período no azul, com margem plausível para o setor
    const totals = sumProfitability(reports);
    expect(totals.realMargin).toBeGreaterThan(0.15);
    expect(totals.realMargin).toBeLessThan(0.5);
  });

  it("gera horas internas (não faturáveis) para a análise de produtividade", async () => {
    const r = await db.query<{ internas: number; sem_contrato: number }>(
      `select
         count(*) filter (where not billable)::int as internas,
         count(*) filter (where contract_id is null)::int as sem_contrato
       from public.time_entries`,
    );
    expect(r.rows[0].internas).toBeGreaterThan(50);
    expect(r.rows[0].sem_contrato).toBeGreaterThan(50);
  });

  it("recusa rodar duas vezes sem --reset e refaz tudo com --reset", async () => {
    const msg = await expectError(runSeed(db, { email: "dono@demo.com", today: "2026-09-17" }));
    expect(msg).toContain("--reset");

    const again = await runSeed(db, { email: "dono@demo.com", reset: true, today: "2026-09-17" });
    expect(again.clients).toBe(10);
    expect(again.contracts).toBe(12);
    expect(again.entries).toBe(summary.entries);
  }, 180_000);

  it("avisa quando o e-mail não existe", async () => {
    const msg = await expectError(runSeed(db, { email: "ninguem@x.com" }));
    expect(msg).toContain("Cadastre-se no app primeiro");
  });
});
