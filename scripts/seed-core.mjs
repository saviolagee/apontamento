/**
 * Núcleo do seed de demonstração: recebe qualquer client com `query(sql, params)`
 * (node-postgres ou PGlite, nos testes) e popula uma empresa completa —
 * 6 colaboradores com custo e vigência, 10 clientes, 12 contratos de
 * periodicidades diferentes, gastos extras e 3 meses de apontamentos.
 *
 * Tudo roda "como" o admin informado (`request.jwt.claims`), então as regras
 * de negócio valem: snapshot de custo, fluxo de aprovação e período fechado.
 */

// ---------------------------------------------------------------------------
// Aleatoriedade determinística: o mesmo seed gera sempre os mesmos números
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
const isWeekend = (date) => date.getUTCDay() === 0 || date.getUTCDay() === 6;

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} client
 * @param {{ email: string, reset?: boolean, today?: string }} options
 */
export async function runSeed(client, { email, reset = false, today: todayISO } = /** @type {any} */ ({})) {
  const rand = mulberry32(20260917);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (min, max) => min + rand() * (max - min);

  const today = new Date(`${todayISO ?? new Date().toISOString().slice(0, 10)}T12:00:00Z`);
  const firstOfMonth = (offset = 0) =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1, 12));
  const lastOfMonth = (offset = 0) =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset + 1, 0, 12));

  const windowStart = firstOfMonth(-2); // 3 meses: dois anteriores + o atual
  const contractStart = firstOfMonth(-8);

  const q = async (sql, params = []) => (await client.query(sql, params)).rows;
  const one = async (sql, params = []) => (await q(sql, params))[0];

  // -------------------------------------------------------------------------
  // Empresa e usuário
  // -------------------------------------------------------------------------
  const user = await one("select id, email from auth.users where lower(email) = lower($1)", [email]);
  if (!user) {
    throw new Error(`Nenhuma conta com o e-mail ${email}. Cadastre-se no app primeiro (/cadastro).`);
  }

  let profile = await one("select id, tenant_id, role from public.profiles where id = $1", [user.id]);
  let createdTenant = false;
  if (!profile) {
    const tenant = await one(
      "insert into public.tenants (name, cnpj, monthly_hours, margin_attention_tolerance) values ($1, $2, 168, 10) returning id",
      ["Consultoria Demonstração", "11222333000181"],
    );
    profile = await one(
      "insert into public.profiles (id, tenant_id, full_name, email, role) values ($1, $2, $3, $4, 'admin') returning id, tenant_id, role",
      [user.id, tenant.id, "Administrador Demo", user.email.toLowerCase()],
    );
    await q("insert into public.employees (tenant_id, profile_id, full_name, email) values ($1, $2, $3, $4)", [
      tenant.id,
      user.id,
      "Administrador Demo",
      user.email.toLowerCase(),
    ]);
    createdTenant = true;
  } else if (profile.role !== "admin") {
    throw new Error("Este usuário não é administrador da empresa. Use uma conta admin.");
  }

  const tenantId = profile.tenant_id;

  // Executa como o admin: triggers e funções enxergam auth.uid().
  // `false` mantém o valor na sessão inteira, mesmo fora de transação.
  await client.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user.id })]);

  // -------------------------------------------------------------------------
  // Limpeza opcional
  // -------------------------------------------------------------------------
  const existing = await one("select count(*)::int as n from public.clients where tenant_id = $1", [tenantId]);
  if (existing.n > 0 && !reset) {
    throw new Error(
      `A empresa já tem ${existing.n} cliente(s). Rode com --reset para apagar os dados atuais antes de popular.`,
    );
  }
  if (reset) {
    await q("delete from public.period_locks where tenant_id = $1", [tenantId]);
    await q("delete from public.time_entries where tenant_id = $1", [tenantId]);
    await q("delete from public.contracts where tenant_id = $1", [tenantId]);
    await q("delete from public.clients where tenant_id = $1", [tenantId]);
    await q("delete from public.employee_costs where tenant_id = $1", [tenantId]);
    await q("delete from public.employees where tenant_id = $1 and profile_id is null", [tenantId]);
    await q("delete from public.activities where tenant_id = $1", [tenantId]);
    await q("delete from public.areas where tenant_id = $1", [tenantId]);
  }

  // -------------------------------------------------------------------------
  // Áreas e atividades
  // -------------------------------------------------------------------------
  const areaDefs = [
    ["Contábil", "Rotinas contábeis, balancetes e fechamentos"],
    ["Fiscal", "Apurações, obrigações acessórias e tributos"],
    ["Consultoria", "Diagnósticos, projetos e assessoria"],
    ["Desenvolvimento", "Automações e integrações"],
  ];
  const areas = {};
  for (const [name, description] of areaDefs) {
    const row = await one("insert into public.areas (tenant_id, name, description) values ($1, $2, $3) returning id", [
      tenantId,
      name,
      description,
    ]);
    areas[name] = row.id;
  }

  const activityDefs = [
    ["Escrituração contábil", "Contábil", true],
    ["Conciliação bancária", "Contábil", true],
    ["Fechamento mensal", "Contábil", true],
    ["Apuração de impostos", "Fiscal", true],
    ["Obrigações acessórias", "Fiscal", true],
    ["Reunião com cliente", "Consultoria", true],
    ["Diagnóstico e planejamento", "Consultoria", true],
    ["Desenvolvimento de automação", "Desenvolvimento", true],
    ["Reunião interna", "Consultoria", false],
    ["Treinamento", "Consultoria", false],
    ["Retrabalho", "Contábil", false],
  ];
  const activities = {};
  for (const [name, area, billable] of activityDefs) {
    const row = await one(
      "insert into public.activities (tenant_id, area_id, name, billable) values ($1, $2, $3, $4) returning id",
      [tenantId, areas[area], name, billable],
    );
    activities[name] = { id: row.id, billable };
  }

  // -------------------------------------------------------------------------
  // Colaboradores e custos (com vigência)
  // -------------------------------------------------------------------------
  const employeeDefs = [
    { name: "Ana Ribeiro", role: "Sócia-diretora", areas: ["Consultoria", "Contábil"], salary: 18000, benefits: 1200, hours: 168 },
    { name: "Bruno Carvalho", role: "Gerente contábil", areas: ["Contábil", "Fiscal"], salary: 11000, benefits: 900, hours: 168 },
    { name: "Carla Souza", role: "Analista fiscal sênior", areas: ["Fiscal"], salary: 7200, benefits: 800, hours: 168 },
    { name: "Diego Martins", role: "Analista contábil", areas: ["Contábil"], salary: 5200, benefits: 700, hours: 168 },
    { name: "Elisa Nunes", role: "Consultora", areas: ["Consultoria"], salary: 9500, benefits: 900, hours: 168 },
    { name: "Felipe Rocha", role: "Desenvolvedor", areas: ["Desenvolvimento"], salary: 12000, benefits: 900, hours: 160 },
  ];

  const employees = [];
  for (const def of employeeDefs) {
    const row = await one(
      "insert into public.employees (tenant_id, full_name, email, job_title, monthly_hours) values ($1, $2, $3, $4, $5) returning id",
      [
        tenantId,
        def.name,
        `${def.name.split(" ")[0].toLowerCase()}@demo.com.br`,
        def.role,
        def.hours === 168 ? null : def.hours,
      ],
    );
    for (const area of def.areas) {
      await q("insert into public.employee_areas (tenant_id, employee_id, area_id) values ($1, $2, $3)", [
        tenantId,
        row.id,
        areas[area],
      ]);
    }
    await q("select public.set_employee_cost($1, $2, 80, 0, $3, $4, $5)", [
      row.id,
      def.salary,
      def.benefits,
      def.hours,
      iso(contractStart),
    ]);
    employees.push({ id: row.id, ...def });
  }

  // Aumento no meio do período: exercita o histórico de custo por vigência
  await q("select public.set_employee_cost($1, 6200, 80, 0, 700, 168, $2)", [
    employees[3].id,
    iso(firstOfMonth(-1)),
  ]);

  // -------------------------------------------------------------------------
  // Clientes
  // -------------------------------------------------------------------------
  const clientDefs = [
    { legal: "Padaria Pão Quente LTDA", trade: "Pão Quente", cnpj: "11222333000181", areas: ["Contábil", "Fiscal"] },
    { legal: "Transportes Vale Norte S.A.", trade: "Vale Norte", cnpj: "04252011000110", areas: ["Contábil", "Fiscal"] },
    { legal: "Clínica Vida Plena LTDA", trade: "Vida Plena", cnpj: "07526557000100", areas: ["Contábil"] },
    { legal: "Construtora Horizonte LTDA", trade: "Horizonte", cnpj: "33000167000101", areas: ["Contábil", "Consultoria"] },
    { legal: "Mercado Bom Preço LTDA", trade: "Bom Preço", cnpj: "60746948000112", areas: ["Fiscal"] },
    { legal: "Software House Nuvem LTDA", trade: "Nuvem", cnpj: "00000000000191", areas: ["Desenvolvimento", "Consultoria"] },
    { legal: "Academia Movimento LTDA", trade: "Movimento", cnpj: "02558157000162", areas: ["Contábil"] },
    { legal: "Escola Aprender Mais LTDA", trade: "Aprender Mais", cnpj: "17155730000164", areas: ["Contábil", "Consultoria"] },
    { legal: "Agropecuária Campo Verde LTDA", trade: "Campo Verde", cnpj: "76535764000143", areas: ["Fiscal", "Consultoria"] },
    { legal: "Hotel Beira Mar LTDA", trade: "Beira Mar", cnpj: "42591651000143", areas: ["Contábil", "Fiscal"] },
  ];

  const clients = [];
  for (const def of clientDefs) {
    const row = await one(
      `insert into public.clients (tenant_id, legal_name, trade_name, cnpj, contact_name, email, phone)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        tenantId,
        def.legal,
        def.trade,
        def.cnpj,
        `Contato ${def.trade}`,
        `financeiro@${def.trade.toLowerCase().replace(/\s+/g, "")}.com.br`,
        `(11) 9${Math.floor(between(1000, 9999))}-${Math.floor(between(1000, 9999))}`,
      ],
    );
    for (const area of def.areas) {
      await q("insert into public.client_areas (tenant_id, client_id, area_id) values ($1, $2, $3)", [
        tenantId,
        row.id,
        areas[area],
      ]);
    }
    clients.push({ id: row.id, ...def });
  }

  // -------------------------------------------------------------------------
  // Contratos — `weight` define quanto cada um consome de horas por dia útil
  // -------------------------------------------------------------------------
  // `weight` = peso na distribuição de horas; `realized` = margem que o
  // contrato deve apresentar no mês fechado (o valor é calibrado depois,
  // a partir do custo realmente apurado). A mistura é proposital:
  // 7 saudáveis, 2 em atenção e 3 críticos.
  const contractDefs = [
    { client: 0, name: "Contabilidade mensal", periodicity: "mensal", margin: 35, tax: 6, weight: 1.0, realized: 0.4, team: [1, 3] },
    { client: 1, name: "Contabilidade e fiscal", periodicity: "mensal", margin: 30, tax: 6, weight: 2.2, realized: 0.1, team: [1, 2, 3] },
    { client: 2, name: "Contabilidade mensal", periodicity: "mensal", margin: 35, tax: 6, weight: 1.1, realized: 0.37, team: [3] },
    { client: 3, name: "Assessoria trimestral", periodicity: "trimestral", margin: 30, tax: 6, weight: 1.6, realized: 0.24, team: [0, 4] },
    { client: 3, name: "Projeto de reestruturação", periodicity: "projeto", margin: 40, tax: 6, weight: 1.2, realized: 0.44, team: [0, 4], startOffset: -3, endOffset: 1 },
    { client: 4, name: "Fiscal mensal", periodicity: "mensal", margin: 30, tax: 6, weight: 2.1, realized: 0.16, team: [2] },
    { client: 5, name: "Squad de automação", periodicity: "bimestral", margin: 35, tax: 6, weight: 2.4, realized: 0.38, team: [5, 4] },
    { client: 6, name: "Contabilidade mensal", periodicity: "mensal", margin: 35, tax: 6, weight: 0.9, realized: 0.41, team: [3] },
    { client: 7, name: "Consultoria semestral", periodicity: "semestral", margin: 30, tax: 6, weight: 1.3, realized: 0.22, team: [0, 4] },
    { client: 8, name: "Planejamento tributário anual", periodicity: "anual", margin: 30, tax: 6, weight: 1.4, realized: 0.33, team: [2, 0] },
    { client: 9, name: "Contabilidade e fiscal", periodicity: "mensal", margin: 30, tax: 6, weight: 1.7, realized: 0.02, team: [1, 2] },
    { client: 5, name: "Implantação de integração", periodicity: "projeto", margin: 35, tax: 6, weight: 0.8, realized: 0.36, team: [5], startOffset: -4, endOffset: 0 },
  ];

  const PERIOD_MONTHS = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

  const contracts = [];
  for (const def of contractDefs) {
    const start = def.startOffset === undefined ? contractStart : firstOfMonth(def.startOffset);
    const end = def.endOffset === undefined ? null : iso(lastOfMonth(def.endOffset));
    const row = await one(
      `insert into public.contracts
         (tenant_id, client_id, name, amount, periodicity, start_date, end_date, desired_margin, tax_rate)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      // Valor provisório: calibrado no fim, com o custo real em mãos
      [tenantId, clients[def.client].id, def.name, 1000, def.periodicity, iso(start), end, def.margin, def.tax],
    );
    for (const index of def.team) {
      await q("insert into public.contract_members (tenant_id, contract_id, employee_id) values ($1, $2, $3)", [
        tenantId,
        row.id,
        employees[index].id,
      ]);
    }
    for (const area of clients[def.client].areas) {
      await q("insert into public.contract_areas (tenant_id, contract_id, area_id) values ($1, $2, $3)", [
        tenantId,
        row.id,
        areas[area],
      ]);
    }
    contracts.push({ id: row.id, ...def });
  }

  // -------------------------------------------------------------------------
  // Gastos extras
  // -------------------------------------------------------------------------
  const expenseDefs = [
    { contract: 1, description: "Licença do sistema fiscal", category: "software", amount: 480, recurrence: "mensal" },
    { contract: 4, description: "Consultor terceirizado", category: "terceirizado", amount: 6500, recurrence: "pontual", monthOffset: -1 },
    { contract: 6, description: "Infraestrutura em nuvem", category: "software", amount: 1200, recurrence: "mensal" },
    { contract: 3, description: "Viagem para reunião", category: "deslocamento", amount: 2300, recurrence: "pontual", monthOffset: -2 },
    { contract: 8, description: "Material e deslocamento", category: "deslocamento", amount: 900, recurrence: "mensal" },
    { contract: 4, description: "Parecer jurídico", category: "terceirizado", amount: 3200, recurrence: "pontual", monthOffset: 0 },
    { contract: 11, description: "Licenças de integração", category: "software", amount: 700, recurrence: "mensal" },
  ];
  for (const def of expenseDefs) {
    const contract = contracts[def.contract];
    const recurringStart = def.startOffset === undefined ? contractStart : firstOfMonth(def.startOffset);
    const date = def.recurrence === "pontual" ? iso(addDays(firstOfMonth(def.monthOffset), 9)) : iso(recurringStart);
    await q(
      `insert into public.contract_expenses (tenant_id, contract_id, description, category, amount, expense_date, recurrence)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, contract.id, def.description, def.category, def.amount, date, def.recurrence],
    );
  }

  // -------------------------------------------------------------------------
  // Apontamentos dos últimos 3 meses
  // -------------------------------------------------------------------------
  const activityByArea = {
    Contábil: ["Escrituração contábil", "Conciliação bancária", "Fechamento mensal"],
    Fiscal: ["Apuração de impostos", "Obrigações acessórias"],
    Consultoria: ["Reunião com cliente", "Diagnóstico e planejamento"],
    Desenvolvimento: ["Desenvolvimento de automação"],
  };
  const internalActivities = ["Reunião interna", "Treinamento", "Retrabalho"];

  const contractsByEmployee = employees.map((_, index) =>
    contracts.filter((contract) => contract.team.includes(index)),
  );

  const values = [];
  for (let day = new Date(windowStart); day <= today; day = addDays(day, 1)) {
    if (isWeekend(day)) continue;
    const date = iso(day);

    employees.forEach((employee, index) => {
      // Uma falta eventual deixa dias em aberto para o alerta aparecer
      if (rand() < 0.06) return;

      const pool = contractsByEmployee[index].filter(
        (contract) => date >= iso(contract.startOffset === undefined ? contractStart : firstOfMonth(contract.startOffset)),
      );
      if (pool.length === 0) return;

      const dayHours = between(6.5, 8.8);
      // Parte do dia vai para atividades internas (não faturáveis)
      const internalHours = rand() < 0.5 ? between(0.5, 1.5) : 0;
      const clientHours = dayHours - internalHours;

      if (internalHours >= 0.5) {
        const activity = activities[pick(internalActivities)];
        values.push([
          tenantId,
          employee.id,
          null,
          activity.id,
          date,
          Math.round((internalHours * 60) / 15) * 15,
          null,
        ]);
      }

      // Divide o dia entre os contratos na proporção dos pesos (com variação),
      // para que o volume mensal de cada contrato fique estável
      const shares = pool.map((contract) => ({ contract, weight: contract.weight * between(0.6, 1.4) }));
      const totalWeight = shares.reduce((sum, item) => sum + item.weight, 0);

      for (const { contract, weight } of shares) {
        const hours = (clientHours * weight) / totalWeight;
        if (hours < 0.5) continue;
        const activityName = pick(activityByArea[pick(clients[contract.client].areas)] ?? activityByArea.Contábil);
        const activity = activities[activityName] ?? activities["Escrituração contábil"];
        values.push([
          tenantId,
          employee.id,
          contract.id,
          activity.id,
          date,
          Math.max(15, Math.round((hours * 60) / 15) * 15),
          `Atendimento ${clients[contract.client].trade}`,
        ]);
      }
    });
  }

  // Insere em lotes para não estourar o limite de parâmetros
  for (let i = 0; i < values.length; i += 200) {
    const chunk = values.slice(i, i + 200);
    const placeholders = chunk
      .map(
        (_, row) =>
          `($${row * 7 + 1}, $${row * 7 + 2}, $${row * 7 + 3}, $${row * 7 + 4}, $${row * 7 + 5}, $${row * 7 + 6}, $${row * 7 + 7})`,
      )
      .join(", ");
    await client.query(
      `insert into public.time_entries
         (tenant_id, employee_id, contract_id, activity_id, entry_date, minutes, description)
       values ${placeholders}`,
      chunk.flat(),
    );
  }

  // -------------------------------------------------------------------------
  // Calibragem dos valores de contrato
  // O valor sai do custo realmente apurado no último mês fechado, para que a
  // margem caia exatamente onde a demonstração precisa.
  // -------------------------------------------------------------------------
  // Média dos dois meses fechados: menos sensível à variação de um mês só
  const closedFrom = iso(firstOfMonth(-2));
  const closedTo = iso(lastOfMonth(-1));

  for (const contract of contracts) {
    const cost = await one(
      `select
         coalesce((
           select sum(cost_amount) from public.time_entries
           where contract_id = $1 and entry_date between $2 and $3 and status <> 'rejeitado'
         ), 0)::float8 as labor,
         coalesce(private.contract_expenses_total($1, $2, $3), 0)::float8 as expenses`,
      [contract.id, closedFrom, closedTo],
    );

    const totalCost = (Number(cost.labor) + Number(cost.expenses)) / 2;
    if (totalCost <= 0) continue;

    const netMonthly = totalCost / (1 - contract.realized);
    const grossMonthly = netMonthly / (1 - contract.tax / 100);
    const months =
      contract.periodicity === "projeto"
        ? Math.max(1, (contract.endOffset ?? 0) - (contract.startOffset ?? 0) + 1)
        : PERIOD_MONTHS[contract.periodicity];

    // Pequena folga: o mês corrente costuma ter mais horas por dia do que a
    // média dos meses fechados usada na calibragem
    const amount = Math.round((grossMonthly * months * 1.15) / 100) * 100;
    await q("update public.contracts set amount = $2 where id = $1", [contract.id, amount]);
  }

  // Meses anteriores revisados; o mês atual fica pendente de aprovação
  await q(
    `update public.time_entries
     set status = 'aprovado'
     where tenant_id = $1 and entry_date < $2`,
    [tenantId, iso(firstOfMonth(0))],
  );
  await q(
    `update public.time_entries
     set status = 'rejeitado', review_comment = 'Lançado no contrato errado'
     where id in (
       select id from public.time_entries
       where tenant_id = $1 and entry_date < $2
       order by entry_date desc, id limit 4
     )`,
    [tenantId, iso(firstOfMonth(0))],
  );

  // Fecha o mês mais antigo da janela, demonstrando o bloqueio de período
  await q("select public.set_period_lock($1)", [iso(lastOfMonth(-2))]);

  const summary = await one(
    `select
       (select count(*)::int from public.clients where tenant_id = $1) as clients,
       (select count(*)::int from public.contracts where tenant_id = $1) as contracts,
       (select count(*)::int from public.employees where tenant_id = $1) as employees,
       (select count(*)::int from public.time_entries where tenant_id = $1) as entries,
       (select coalesce(round(sum(minutes) / 60.0), 0)::int from public.time_entries where tenant_id = $1) as hours`,
    [tenantId],
  );

  return {
    tenantId,
    createdTenant,
    lockedThrough: iso(lastOfMonth(-2)),
    windowStart: iso(windowStart),
    windowEnd: iso(today),
    ...summary,
  };
}
