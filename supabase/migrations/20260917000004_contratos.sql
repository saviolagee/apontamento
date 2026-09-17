-- =====================================================================
-- Etapa 3: contratos, vínculos (áreas/atividades/colaboradores) e
-- gastos extras
-- =====================================================================

create type public.contract_periodicity as enum (
  'mensal', 'bimestral', 'trimestral', 'semestral', 'anual', 'projeto'
);

create type public.contract_status as enum ('ativo', 'pausado', 'encerrado');

create type public.expense_category as enum (
  'deslocamento', 'software', 'terceirizado', 'impostos', 'outros'
);

create type public.expense_recurrence as enum (
  'pontual', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual'
);

-- Meses de cada período ('projeto' = valor único, distribuído entre as datas)
create or replace function private.periodicity_months(p public.contract_periodicity)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'mensal' then 1
    when 'bimestral' then 2
    when 'trimestral' then 3
    when 'semestral' then 6
    when 'anual' then 12
    else null
  end
$$;

create or replace function private.recurrence_months(r public.expense_recurrence)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case r
    when 'mensal' then 1
    when 'bimestral' then 2
    when 'trimestral' then 3
    when 'semestral' then 6
    when 'anual' then 12
    else null
  end
$$;

-- ---------------------------------------------------------------------
-- Contratos
-- ---------------------------------------------------------------------
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 150),
  description text,
  -- Valor do contrato no período (ou valor total, se periodicidade = projeto)
  amount numeric(14, 2) not null check (amount >= 0),
  periodicity public.contract_periodicity not null default 'mensal',
  start_date date not null,
  end_date date,
  -- Margem desejada para este contrato (%)
  desired_margin numeric(5, 2) not null default 20
    check (desired_margin >= 0 and desired_margin < 100),
  -- Alíquota de impostos sobre a receita (%)
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  -- Horas previstas por período (opcional)
  expected_hours numeric(8, 2) check (expected_hours is null or expected_hours > 0),
  status public.contract_status not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracts_period_check check (end_date is null or end_date >= start_date),
  -- Projeto fechado precisa de data de término para distribuir a receita
  constraint contracts_project_end_date_check
    check (periodicity <> 'projeto' or end_date is not null)
);

create index contracts_tenant_id_idx on public.contracts (tenant_id);
create index contracts_client_id_idx on public.contracts (client_id);

create trigger contracts_set_updated_at
  before update on public.contracts
  for each row execute function private.set_updated_at();

-- Vínculos (sem informação financeira)
create table public.contract_areas (
  contract_id uuid not null references public.contracts (id) on delete cascade,
  area_id uuid not null references public.areas (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  primary key (contract_id, area_id)
);

create table public.contract_activities (
  contract_id uuid not null references public.contracts (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  primary key (contract_id, activity_id)
);

create table public.contract_members (
  contract_id uuid not null references public.contracts (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  primary key (contract_id, employee_id)
);

create index contract_members_employee_idx on public.contract_members (employee_id);

-- ---------------------------------------------------------------------
-- Gastos extras do contrato
-- ---------------------------------------------------------------------
create table public.contract_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  contract_id uuid not null references public.contracts (id) on delete cascade,
  description text not null check (char_length(trim(description)) between 2 and 200),
  category public.expense_category not null default 'outros',
  amount numeric(14, 2) not null check (amount >= 0),
  -- Data do gasto (pontual) ou início da recorrência
  expense_date date not null,
  recurrence public.expense_recurrence not null default 'pontual',
  -- Fim da recorrência (opcional)
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_expenses_period_check check (end_date is null or end_date >= expense_date),
  constraint contract_expenses_recurrence_check
    check (recurrence <> 'pontual' or end_date is null)
);

create index contract_expenses_contract_idx on public.contract_expenses (contract_id, expense_date);

create trigger contract_expenses_set_updated_at
  before update on public.contract_expenses
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS: valores de contrato e gastos são visíveis apenas para admin/gestor
-- ---------------------------------------------------------------------
alter table public.contracts enable row level security;
alter table public.contract_areas enable row level security;
alter table public.contract_activities enable row level security;
alter table public.contract_members enable row level security;
alter table public.contract_expenses enable row level security;

revoke all on public.contracts, public.contract_areas, public.contract_activities,
  public.contract_members, public.contract_expenses from anon;

create policy contracts_select on public.contracts
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()));

create policy contracts_insert on public.contracts
  for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()));

create policy contracts_update on public.contracts
  for update to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()))
  with check (tenant_id = (select private.current_tenant_id()));

create policy contracts_delete on public.contracts
  for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()));

create policy contract_expenses_select on public.contract_expenses
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()));

create policy contract_expenses_insert on public.contract_expenses
  for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()));

create policy contract_expenses_update on public.contract_expenses
  for update to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()))
  with check (tenant_id = (select private.current_tenant_id()));

create policy contract_expenses_delete on public.contract_expenses
  for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()));

-- Vínculos: toda a empresa lê (o colaborador precisa saber em que pode
-- apontar); só admin/gestor altera.
do $$
declare
  t text;
begin
  foreach t in array array['contract_areas', 'contract_activities', 'contract_members']
  loop
    execute format($f$
      create policy %1$s_select on public.%1$s
        for select to authenticated
        using (tenant_id = (select private.current_tenant_id()));

      create policy %1$s_insert on public.%1$s
        for insert to authenticated
        with check (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()));

      create policy %1$s_delete on public.%1$s
        for delete to authenticated
        using (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()));
    $f$, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Lista de contratos para apontamento (sem valores) — o colaborador
-- precisa escolher o contrato sem enxergar receita, margem ou custo.
-- A view roda como owner e filtra pela empresa do usuário.
-- ---------------------------------------------------------------------
create view public.contract_options
with (security_invoker = false) as
  select c.id, c.tenant_id, c.client_id, c.name, c.status, c.start_date, c.end_date
  from public.contracts c
  where c.tenant_id = private.current_tenant_id();

revoke all on public.contract_options from anon;
grant select on public.contract_options to authenticated;

-- ---------------------------------------------------------------------
-- Receita do contrato normalizada para um intervalo de datas.
-- Recorrentes: valor por período ÷ meses do período × meses do intervalo.
-- Projeto fechado: valor total distribuído proporcionalmente aos dias.
-- ---------------------------------------------------------------------
create or replace function private.contract_revenue(
  p_contract_id uuid,
  p_from date,
  p_to date
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.contracts;
  v_start date;
  v_end date;
  v_months numeric;
  v_days numeric;
  v_total_days numeric;
begin
  select * into c from public.contracts where id = p_contract_id;
  if not found then
    return 0;
  end if;

  -- Intersecção entre a vigência do contrato e o período consultado
  v_start := greatest(c.start_date, p_from);
  v_end := least(coalesce(c.end_date, p_to), p_to);
  if v_start > v_end then
    return 0;
  end if;

  if c.periodicity = 'projeto' then
    v_total_days := (c.end_date - c.start_date) + 1;
    v_days := (v_end - v_start) + 1;
    return round(c.amount * (v_days / v_total_days), 2);
  end if;

  -- Fração de meses coberta pelo intervalo (dias ÷ dias do mês)
  v_months := private.months_between(v_start, v_end);
  return round(c.amount / private.periodicity_months(c.periodicity) * v_months, 2);
end;
$$;

-- Meses (fracionados) entre duas datas, inclusivo
create or replace function private.months_between(p_from date, p_to date)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select sum(
    (least(p_to, (date_trunc('month', d) + interval '1 month - 1 day')::date)
      - greatest(p_from, d::date) + 1)::numeric
    / extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::numeric
  )
  from generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') d
$$;

-- Gastos extras do período: pontuais dentro do intervalo + recorrentes
-- normalizados pelos meses cobertos.
create or replace function private.contract_expenses_total(
  p_contract_id uuid,
  p_from date,
  p_to date
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case
      when e.recurrence = 'pontual' then
        case when e.expense_date between p_from and p_to then e.amount else 0 end
      else
        case
          when greatest(e.expense_date, p_from) > least(coalesce(e.end_date, p_to), p_to) then 0
          else round(
            e.amount / private.recurrence_months(e.recurrence)
            * private.months_between(
                greatest(e.expense_date, p_from),
                least(coalesce(e.end_date, p_to), p_to)
              ),
            2)
        end
    end
  ), 0)
  from public.contract_expenses e
  where e.contract_id = p_contract_id
$$;
