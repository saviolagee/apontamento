-- =====================================================================
-- Etapa 6: agregações para o dashboard gerencial
-- =====================================================================

-- Horas e custo por contrato × área (a receita é rateada na aplicação,
-- proporcionalmente às horas de cada área)
create or replace function public.contract_area_hours(p_from date, p_to date)
returns table (
  contract_id uuid,
  area_id uuid,
  area_name text,
  hours numeric,
  billable_hours numeric,
  labor_cost numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.contract_id,
    ar.id,
    coalesce(ar.name, 'Sem área'),
    sum(t.minutes) / 60.0,
    sum(t.minutes) filter (where t.billable) / 60.0,
    sum(t.cost_amount)
  from public.time_entries t
  join public.activities a on a.id = t.activity_id
  left join public.areas ar on ar.id = a.area_id
  where t.tenant_id = private.current_tenant_id()
    and private.is_manager()
    and t.entry_date between p_from and p_to
    and t.status <> 'rejeitado'
    and t.contract_id is not null
  group by t.contract_id, ar.id, ar.name
$$;

-- Custo por atividade (quais atividades mais consomem margem)
create or replace function public.activity_metrics(p_from date, p_to date)
returns table (
  activity_id uuid,
  activity_name text,
  area_name text,
  billable boolean,
  hours numeric,
  labor_cost numeric,
  entries_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.name,
    coalesce(ar.name, 'Sem área'),
    a.billable,
    sum(t.minutes) / 60.0,
    sum(t.cost_amount),
    count(*)::integer
  from public.time_entries t
  join public.activities a on a.id = t.activity_id
  left join public.areas ar on ar.id = a.area_id
  where t.tenant_id = private.current_tenant_id()
    and private.is_manager()
    and t.entry_date between p_from and p_to
    and t.status <> 'rejeitado'
  group by a.id, a.name, ar.name, a.billable
$$;

-- Custo alocado por colaborador em cada cliente
create or replace function public.employee_client_cost(p_from date, p_to date)
returns table (
  employee_id uuid,
  employee_name text,
  client_id uuid,
  client_name text,
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
    cl.id,
    coalesce(nullif(cl.trade_name, ''), cl.legal_name),
    sum(t.minutes) / 60.0,
    sum(t.cost_amount)
  from public.time_entries t
  join public.employees e on e.id = t.employee_id
  join public.contracts c on c.id = t.contract_id
  join public.clients cl on cl.id = c.client_id
  where t.tenant_id = private.current_tenant_id()
    and private.is_manager()
    and t.entry_date between p_from and p_to
    and t.status <> 'rejeitado'
  group by e.id, e.full_name, cl.id, cl.trade_name, cl.legal_name
$$;

-- Colaboradores ativos sem custo vigente: as horas deles entrariam com
-- custo zero e inflariam a margem dos contratos.
create or replace function public.employees_missing_cost()
returns table (
  employee_id uuid,
  employee_name text,
  hours_last_90_days numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    e.full_name,
    coalesce((
      select sum(t.minutes) / 60.0
      from public.time_entries t
      where t.employee_id = e.id
        and t.entry_date >= current_date - 90
        and t.status <> 'rejeitado'
    ), 0)
  from public.employees e
  where e.tenant_id = private.current_tenant_id()
    and private.is_manager()
    and e.active
    and private.employee_hourly_cost(e.id, current_date) is null
$$;

revoke execute on function public.contract_area_hours(date, date) from public, anon;
revoke execute on function public.activity_metrics(date, date) from public, anon;
revoke execute on function public.employee_client_cost(date, date) from public, anon;
revoke execute on function public.employees_missing_cost() from public, anon;
grant execute on function public.contract_area_hours(date, date) to authenticated;
grant execute on function public.activity_metrics(date, date) to authenticated;
grant execute on function public.employee_client_cost(date, date) to authenticated;
grant execute on function public.employees_missing_cost() to authenticated;
