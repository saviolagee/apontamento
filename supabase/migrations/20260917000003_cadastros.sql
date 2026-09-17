-- =====================================================================
-- Etapa 2: áreas de atuação, atividades, colaboradores (com custo e
-- vigência) e clientes
-- =====================================================================

-- ---------------------------------------------------------------------
-- Áreas de atuação
-- ---------------------------------------------------------------------
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index areas_tenant_id_idx on public.areas (tenant_id);
create unique index areas_tenant_name_key on public.areas (tenant_id, lower(name));

create trigger areas_set_updated_at
  before update on public.areas
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Atividades
-- ---------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  area_id uuid references public.areas (id) on delete set null,
  name text not null check (char_length(trim(name)) between 2 and 100),
  billable boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activities_tenant_id_idx on public.activities (tenant_id);
create index activities_area_id_idx on public.activities (area_id);
create unique index activities_tenant_name_key on public.activities (tenant_id, lower(name));

create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Colaboradores
-- ---------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Login vinculado (pode existir colaborador sem acesso ao sistema)
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null check (char_length(trim(full_name)) between 2 and 150),
  email text,
  job_title text,
  -- Horas disponíveis no mês; nulo = usa a jornada padrão da empresa
  monthly_hours numeric(6, 2) check (monthly_hours > 0 and monthly_hours <= 744),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index employees_tenant_id_idx on public.employees (tenant_id);
create unique index employees_tenant_email_key on public.employees (tenant_id, lower(email))
  where email is not null;

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function private.set_updated_at();

create table public.employee_areas (
  employee_id uuid not null references public.employees (id) on delete cascade,
  area_id uuid not null references public.areas (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  primary key (employee_id, area_id)
);

create index employee_areas_area_id_idx on public.employee_areas (area_id);

-- ---------------------------------------------------------------------
-- Custo do colaborador com vigência (dado sensível: só admin/permitidos)
-- ---------------------------------------------------------------------
create table public.employee_costs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  monthly_salary numeric(12, 2) not null check (monthly_salary >= 0),
  charges_percent numeric(5, 2) not null default 0 check (charges_percent >= 0 and charges_percent <= 300),
  charges_amount numeric(12, 2) not null default 0 check (charges_amount >= 0),
  benefits numeric(12, 2) not null default 0 check (benefits >= 0),
  monthly_hours numeric(6, 2) not null check (monthly_hours > 0 and monthly_hours <= 744),
  valid_from date not null,
  valid_to date,
  -- (salário + encargos + benefícios) ÷ horas disponíveis
  hourly_cost numeric(12, 4) generated always as (
    round(
      (monthly_salary + (monthly_salary * charges_percent / 100) + charges_amount + benefits) / monthly_hours,
      4
    )
  ) stored,
  created_at timestamptz not null default now(),
  constraint employee_costs_period_check check (valid_to is null or valid_to >= valid_from)
);

create index employee_costs_employee_idx on public.employee_costs (employee_id, valid_from desc);

-- Impede vigências sobrepostas para o mesmo colaborador
create or replace function private.employee_costs_no_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.employee_costs c
    where c.employee_id = new.employee_id
      and c.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(c.valid_from, c.valid_to, '[]') && daterange(new.valid_from, new.valid_to, '[]')
  ) then
    raise exception 'Já existe um custo vigente nesse período para este colaborador.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger employee_costs_no_overlap
  before insert or update on public.employee_costs
  for each row execute function private.employee_costs_no_overlap();

-- Custo hora vigente em uma data (uso interno do motor de cálculo)
create or replace function private.employee_hourly_cost(p_employee_id uuid, p_date date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select c.hourly_cost
  from public.employee_costs c
  where c.employee_id = p_employee_id
    and c.valid_from <= p_date
    and (c.valid_to is null or c.valid_to >= p_date)
  order by c.valid_from desc
  limit 1
$$;

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  legal_name text not null check (char_length(trim(legal_name)) between 2 and 150),
  trade_name text,
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  contact_name text,
  email text,
  phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_tenant_id_idx on public.clients (tenant_id);
create unique index clients_tenant_name_key on public.clients (tenant_id, lower(legal_name));

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function private.set_updated_at();

create table public.client_areas (
  client_id uuid not null references public.clients (id) on delete cascade,
  area_id uuid not null references public.areas (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  primary key (client_id, area_id)
);

create index client_areas_area_id_idx on public.client_areas (area_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.areas enable row level security;
alter table public.activities enable row level security;
alter table public.employees enable row level security;
alter table public.employee_areas enable row level security;
alter table public.employee_costs enable row level security;
alter table public.clients enable row level security;
alter table public.client_areas enable row level security;

revoke all on public.areas, public.activities, public.employees, public.employee_areas,
  public.employee_costs, public.clients, public.client_areas from anon;

-- Cadastros "de referência": todos da empresa leem (o colaborador precisa
-- para apontar horas); só admin/gestor escrevem.
do $$
declare
  t text;
begin
  foreach t in array array['areas', 'activities', 'clients', 'employee_areas', 'client_areas']
  loop
    execute format($f$
      create policy %1$s_select on public.%1$s
        for select to authenticated
        using (tenant_id = (select private.current_tenant_id()));

      create policy %1$s_insert on public.%1$s
        for insert to authenticated
        with check (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()));

      create policy %1$s_update on public.%1$s
        for update to authenticated
        using (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()))
        with check (tenant_id = (select private.current_tenant_id()));

      create policy %1$s_delete on public.%1$s
        for delete to authenticated
        using (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()));
    $f$, t);
  end loop;
end;
$$;

-- employees: leitura para a empresa (nomes aparecem em apontamentos e filtros)
create policy employees_select on public.employees
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));

create policy employees_insert on public.employees
  for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()));

create policy employees_update on public.employees
  for update to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()))
  with check (tenant_id = (select private.current_tenant_id()));

create policy employees_delete on public.employees
  for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_manager()));

-- employee_costs: salário/custo individual — admin sempre; gestor só com
-- a permissão "ver custos" ligada. Escrita: somente admin.
create policy employee_costs_select on public.employee_costs
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.can_view_costs()));

create policy employee_costs_insert on public.employee_costs
  for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()));

create policy employee_costs_update on public.employee_costs
  for update to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()))
  with check (tenant_id = (select private.current_tenant_id()));

create policy employee_costs_delete on public.employee_costs
  for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()));

-- ---------------------------------------------------------------------
-- Cadastro de custo com fechamento automático da vigência anterior
-- ---------------------------------------------------------------------
create or replace function public.set_employee_cost(
  p_employee_id uuid,
  p_monthly_salary numeric,
  p_charges_percent numeric,
  p_charges_amount numeric,
  p_benefits numeric,
  p_monthly_hours numeric,
  p_valid_from date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.current_tenant_id();
  v_current public.employee_costs;
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Apenas administradores podem definir custos.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.employees e where e.id = p_employee_id and e.tenant_id = v_tenant) then
    raise exception 'Colaborador não encontrado.' using errcode = 'P0002';
  end if;

  -- Vigência que cobre a data informada
  select * into v_current
  from public.employee_costs c
  where c.employee_id = p_employee_id
    and c.valid_from <= p_valid_from
    and (c.valid_to is null or c.valid_to >= p_valid_from)
  order by c.valid_from desc
  limit 1;

  if found then
    if v_current.valid_from = p_valid_from then
      raise exception 'Já existe um custo iniciando em %. Edite o registro existente.', to_char(p_valid_from, 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
    -- Fecha a vigência anterior no dia anterior ao novo início
    update public.employee_costs
    set valid_to = p_valid_from - 1
    where id = v_current.id;
  end if;

  insert into public.employee_costs (
    tenant_id, employee_id, monthly_salary, charges_percent, charges_amount,
    benefits, monthly_hours, valid_from
  )
  values (
    v_tenant, p_employee_id, p_monthly_salary, coalesce(p_charges_percent, 0), coalesce(p_charges_amount, 0),
    coalesce(p_benefits, 0), p_monthly_hours, p_valid_from
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.set_employee_cost(uuid, numeric, numeric, numeric, numeric, numeric, date)
  from public, anon;
grant execute on function public.set_employee_cost(uuid, numeric, numeric, numeric, numeric, numeric, date)
  to authenticated;

-- ---------------------------------------------------------------------
-- Vínculo colaborador ↔ login
-- ---------------------------------------------------------------------
alter table public.invitations
  add column employee_id uuid references public.employees (id) on delete cascade;

-- Todo usuário com acesso também é um colaborador (para apontar horas)
create or replace function private.accept_invitation_for(p_user_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_employee_id uuid;
begin
  if exists (select 1 from public.profiles where id = p_user_id) then
    return (select tenant_id from public.profiles where id = p_user_id);
  end if;

  select * into v_inv
  from public.invitations i
  where lower(i.email) = lower(p_email) and i.accepted_at is null
  limit 1;

  if not found then
    return null;
  end if;

  insert into public.profiles (id, tenant_id, full_name, email, role, can_view_costs)
  values (p_user_id, v_inv.tenant_id, v_inv.full_name, lower(p_email), v_inv.role, v_inv.can_view_costs);

  if v_inv.employee_id is not null then
    update public.employees set profile_id = p_user_id, active = true
    where id = v_inv.employee_id and tenant_id = v_inv.tenant_id;
    v_employee_id := v_inv.employee_id;
  else
    select e.id into v_employee_id
    from public.employees e
    where e.tenant_id = v_inv.tenant_id and lower(e.email) = lower(p_email) and e.profile_id is null
    limit 1;

    if v_employee_id is null then
      insert into public.employees (tenant_id, profile_id, full_name, email)
      values (v_inv.tenant_id, p_user_id, v_inv.full_name, lower(p_email));
    else
      update public.employees set profile_id = p_user_id where id = v_employee_id;
    end if;
  end if;

  update public.invitations set accepted_at = now() where id = v_inv.id;

  return v_inv.tenant_id;
end;
$$;

-- O dono que cria a empresa também vira colaborador
create or replace function public.create_tenant(
  p_name text,
  p_cnpj text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_tenant_id uuid;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Usuário já pertence a uma empresa.' using errcode = 'P0001';
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into public.tenants (name, cnpj)
  values (trim(p_name), nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), ''))
  returning id into v_tenant_id;

  insert into public.profiles (id, tenant_id, full_name, email, role)
  values (v_uid, v_tenant_id, trim(p_full_name), lower(v_email), 'admin');

  insert into public.employees (tenant_id, profile_id, full_name, email)
  values (v_tenant_id, v_uid, trim(p_full_name), lower(v_email));

  return v_tenant_id;
end;
$$;

-- Colaborador vinculado ao usuário atual (usado pelo apontamento de horas)
create or replace function private.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.employees e
  where e.profile_id = auth.uid() and e.active
$$;
