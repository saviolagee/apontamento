-- =====================================================================
-- Etapa 5: motor de cálculo de rentabilidade
-- Agregados por contrato em qualquer período. Os indicadores derivados
-- (margem, limite de horas, projeção, status) ficam na camada de serviço.
-- =====================================================================

-- Custo hora médio da equipe alocada ao contrato, na data de referência.
-- Sem alocação explícita, usa o custo médio de quem realmente apontou.
create or replace function private.contract_team_cost_per_hour(
  p_contract_id uuid,
  p_reference date
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select avg(private.employee_hourly_cost(m.employee_id, p_reference))
      from public.contract_members m
      where m.contract_id = p_contract_id
        and private.employee_hourly_cost(m.employee_id, p_reference) is not null
    ),
    (
      select case when sum(t.minutes) > 0
        then sum(t.cost_amount) / (sum(t.minutes) / 60.0)
        else null end
      from public.time_entries t
      where t.contract_id = p_contract_id and t.status <> 'rejeitado'
    )
  )
$$;

-- Agregados de um período por contrato (apontamentos rejeitados não contam)
create or replace function public.contract_metrics(p_from date, p_to date)
returns table (
  contract_id uuid,
  contract_name text,
  client_id uuid,
  client_name text,
  periodicity public.contract_periodicity,
  contract_status public.contract_status,
  amount numeric,
  desired_margin numeric,
  tax_rate numeric,
  expected_hours numeric,
  start_date date,
  end_date date,
  revenue numeric,
  hours numeric,
  billable_hours numeric,
  labor_cost numeric,
  expense_cost numeric,
  team_cost_per_hour numeric,
  entries_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.name,
    cl.id,
    coalesce(nullif(cl.trade_name, ''), cl.legal_name),
    c.periodicity,
    c.status,
    c.amount,
    c.desired_margin,
    c.tax_rate,
    c.expected_hours,
    c.start_date,
    c.end_date,
    private.contract_revenue(c.id, p_from, p_to),
    coalesce(t.hours, 0),
    coalesce(t.billable_hours, 0),
    coalesce(t.labor_cost, 0),
    private.contract_expenses_total(c.id, p_from, p_to),
    private.contract_team_cost_per_hour(c.id, p_to),
    coalesce(t.entries_count, 0)
  from public.contracts c
  join public.clients cl on cl.id = c.client_id
  left join lateral (
    select
      sum(e.minutes) / 60.0 as hours,
      sum(e.minutes) filter (where e.billable) / 60.0 as billable_hours,
      sum(e.cost_amount) as labor_cost,
      count(*)::integer as entries_count
    from public.time_entries e
    where e.contract_id = c.id
      and e.entry_date between p_from and p_to
      and e.status <> 'rejeitado'
  ) t on true
  where c.tenant_id = private.current_tenant_id()
    and private.is_manager()
$$;

-- Horas e custo por colaborador / atividade / área em um contrato
create or replace function public.contract_hours_breakdown(
  p_contract_id uuid,
  p_from date,
  p_to date
)
returns table (
  employee_id uuid,
  employee_name text,
  activity_id uuid,
  activity_name text,
  area_id uuid,
  area_name text,
  billable boolean,
  hours numeric,
  labor_cost numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    e.full_name,
    a.id,
    a.name,
    ar.id,
    ar.name,
    t.billable,
    sum(t.minutes) / 60.0,
    sum(t.cost_amount)
  from public.time_entries t
  join public.employees e on e.id = t.employee_id
  join public.activities a on a.id = t.activity_id
  left join public.areas ar on ar.id = a.area_id
  where t.contract_id = p_contract_id
    and t.entry_date between p_from and p_to
    and t.status <> 'rejeitado'
    and t.tenant_id = private.current_tenant_id()
    and private.is_manager()
  group by e.id, e.full_name, a.id, a.name, ar.id, ar.name, t.billable
$$;

-- Utilização da equipe no período (horas apontadas ÷ horas disponíveis)
create or replace function public.employee_metrics(p_from date, p_to date)
returns table (
  employee_id uuid,
  employee_name text,
  active boolean,
  available_hours numeric,
  hours numeric,
  billable_hours numeric,
  labor_cost numeric,
  entries_count integer,
  last_entry_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    e.full_name,
    e.active,
    -- Jornada do colaborador (ou padrão da empresa) proporcional aos meses
    coalesce(e.monthly_hours, tn.monthly_hours) * private.months_between(p_from, p_to),
    coalesce(t.hours, 0),
    coalesce(t.billable_hours, 0),
    coalesce(t.labor_cost, 0),
    coalesce(t.entries_count, 0),
    t.last_entry_date
  from public.employees e
  join public.tenants tn on tn.id = e.tenant_id
  left join lateral (
    select
      sum(x.minutes) / 60.0 as hours,
      sum(x.minutes) filter (where x.billable) / 60.0 as billable_hours,
      sum(x.cost_amount) as labor_cost,
      count(*)::integer as entries_count,
      max(x.entry_date) as last_entry_date
    from public.time_entries x
    where x.employee_id = e.id
      and x.entry_date between p_from and p_to
      and x.status <> 'rejeitado'
  ) t on true
  where e.tenant_id = private.current_tenant_id()
    and private.is_manager()
$$;

revoke execute on function public.contract_metrics(date, date) from public, anon;
revoke execute on function public.contract_hours_breakdown(uuid, date, date) from public, anon;
revoke execute on function public.employee_metrics(date, date) from public, anon;
grant execute on function public.contract_metrics(date, date) to authenticated;
grant execute on function public.contract_hours_breakdown(uuid, date, date) to authenticated;
grant execute on function public.employee_metrics(date, date) to authenticated;

-- Análises do próprio colaborador (sem custos): horas por dia/atividade
create or replace function public.my_hours_breakdown(p_from date, p_to date)
returns table (
  entry_date date,
  contract_id uuid,
  contract_name text,
  client_name text,
  activity_id uuid,
  activity_name text,
  area_id uuid,
  area_name text,
  billable boolean,
  hours numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.entry_date,
    c.id,
    c.name,
    coalesce(nullif(cl.trade_name, ''), cl.legal_name),
    a.id,
    a.name,
    ar.id,
    ar.name,
    t.billable,
    sum(t.minutes) / 60.0
  from public.time_entries t
  join public.activities a on a.id = t.activity_id
  left join public.areas ar on ar.id = a.area_id
  left join public.contracts c on c.id = t.contract_id
  left join public.clients cl on cl.id = c.client_id
  where t.employee_id = private.current_employee_id()
    and t.entry_date between p_from and p_to
    and t.status <> 'rejeitado'
  group by t.entry_date, c.id, c.name, cl.trade_name, cl.legal_name, a.id, a.name, ar.id, ar.name, t.billable
$$;

revoke execute on function public.my_hours_breakdown(date, date) from public, anon;
grant execute on function public.my_hours_breakdown(date, date) to authenticated;
