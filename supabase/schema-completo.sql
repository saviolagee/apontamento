-- Gerado por "npm run db:bundle" a partir de supabase/migrations.
-- Cole este conteúdo no SQL Editor do Supabase e execute.

-- ======== 20260917000001_core_tenancy.sql ========
-- =====================================================================
-- Etapa 1: multiempresa (tenants), perfis de acesso, convites e RLS base
-- =====================================================================

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create type public.app_role as enum ('admin', 'gestor', 'colaborador');

-- ---------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Empresas (tenants)
-- ---------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 150),
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  logo_url text,
  -- Jornada padrão mensal (horas disponíveis por colaborador)
  monthly_hours numeric(6, 2) not null default 168
    check (monthly_hours > 0 and monthly_hours <= 744),
  -- Faixa "Atenção": margem real abaixo da meta em até X pontos percentuais.
  -- Abaixo disso (ou prejuízo) o contrato é "Crítico".
  margin_attention_tolerance numeric(5, 2) not null default 10
    check (margin_attention_tolerance >= 0 and margin_attention_tolerance <= 100),
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Perfis (1 usuário = 1 empresa)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 150),
  email text not null,
  role public.app_role not null default 'colaborador',
  -- Permissão configurável pelo admin: gestor pode ver custo individual
  can_view_costs boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_tenant_id_idx on public.profiles (tenant_id);
create unique index profiles_email_key on public.profiles (lower(email));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Convites
-- ---------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name text not null check (char_length(full_name) between 2 and 150),
  role public.app_role not null default 'colaborador',
  can_view_costs boolean not null default false,
  invited_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index invitations_tenant_id_idx on public.invitations (tenant_id);
create unique index invitations_pending_email_key
  on public.invitations (lower(email)) where accepted_at is null;

-- ---------------------------------------------------------------------
-- Funções auxiliares de RLS (SECURITY DEFINER evita recursão nas policies)
-- ---------------------------------------------------------------------
create or replace function private.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = auth.uid() and p.active
$$;

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.active
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = 'admin', false)
$$;

-- Admin ou gestor
create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() in ('admin', 'gestor'), false)
$$;

-- Pode ver custo/salário individual de colaboradores
create or replace function private.can_view_costs()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' or (p.role = 'gestor' and p.can_view_costs)
     from public.profiles p
     where p.id = auth.uid() and p.active),
    false
  )
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;

-- Nada de acesso anônimo
revoke all on public.tenants, public.profiles, public.invitations from anon;

-- tenants: leitura para membros; alteração só admin; criação via RPC
revoke insert, delete, truncate on public.tenants from authenticated;

create policy tenants_select on public.tenants
  for select to authenticated
  using (id = (select private.current_tenant_id()));

create policy tenants_update on public.tenants
  for update to authenticated
  using (id = (select private.current_tenant_id()) and (select private.is_admin()))
  with check (id = (select private.current_tenant_id()));

-- profiles: membros da mesma empresa se enxergam (sem dados sensíveis aqui).
-- Cada usuário só altera o próprio nome; papel/permissões via RPC de admin.
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and tenant_id = (select private.current_tenant_id()))
  with check (id = (select auth.uid()));

-- invitations: só admin
revoke update, truncate on public.invitations from authenticated;

create policy invitations_select on public.invitations
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_admin()));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    tenant_id = (select private.current_tenant_id())
    and (select private.is_admin())
    and accepted_at is null
  );

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and (select private.is_admin())
    and accepted_at is null
  );

-- Impede convite para e-mail que já pertence a alguma empresa
create or replace function private.invitations_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  new.invited_by := auth.uid();
  if exists (select 1 from public.profiles p where lower(p.email) = new.email) then
    raise exception 'Este e-mail já está vinculado a uma empresa.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger invitations_before_insert
  before insert on public.invitations
  for each row execute function private.invitations_before_insert();

-- ---------------------------------------------------------------------
-- Aceite de convite
-- ---------------------------------------------------------------------
create or replace function private.accept_invitation_for(p_user_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
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

  update public.invitations set accepted_at = now() where id = v_inv.id;

  return v_inv.tenant_id;
end;
$$;

-- Novo usuário no Auth: se houver convite pendente, vincula à empresa
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.accept_invitation_for(new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Usuário já existente que recebeu convite depois: aceita ao entrar
create or replace function public.accept_pending_invitation()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select u.email into v_email
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;

  if v_email is null then
    return null;
  end if;

  return private.accept_invitation_for(auth.uid(), v_email);
end;
$$;

-- ---------------------------------------------------------------------
-- Criação de empresa (onboarding): usuário sem empresa vira admin
-- ---------------------------------------------------------------------
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

  return v_tenant_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Admin altera papel/permissões/status de um membro
-- ---------------------------------------------------------------------
create or replace function public.admin_update_member(
  p_profile_id uuid,
  p_role public.app_role,
  p_can_view_costs boolean,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.current_tenant_id();
  v_target public.profiles;
begin
  if not private.is_admin() then
    raise exception 'Apenas administradores podem alterar membros.' using errcode = '42501';
  end if;

  select * into v_target from public.profiles where id = p_profile_id and tenant_id = v_tenant;
  if not found then
    raise exception 'Membro não encontrado.' using errcode = 'P0002';
  end if;

  if v_target.role = 'admin' and v_target.active
     and (p_role <> 'admin' or not p_active)
     and (select count(*) from public.profiles
          where tenant_id = v_tenant and role = 'admin' and active) <= 1 then
    raise exception 'A empresa precisa de pelo menos um administrador ativo.' using errcode = 'P0001';
  end if;

  update public.profiles
  set role = p_role,
      can_view_costs = case when p_role = 'gestor' then p_can_view_costs else false end,
      active = p_active
  where id = p_profile_id;
end;
$$;

revoke execute on function public.create_tenant(text, text, text) from public, anon;
revoke execute on function public.accept_pending_invitation() from public, anon;
revoke execute on function public.admin_update_member(uuid, public.app_role, boolean, boolean) from public, anon;
grant execute on function public.create_tenant(text, text, text) to authenticated;
grant execute on function public.accept_pending_invitation() to authenticated;
grant execute on function public.admin_update_member(uuid, public.app_role, boolean, boolean) to authenticated;

revoke execute on function private.accept_invitation_for(uuid, text) from public, anon, authenticated;

-- ======== 20260917000002_storage_logos.sql ========
-- Logos das empresas: leitura pública, escrita só pelo admin na pasta da própria empresa
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy logos_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (select private.current_tenant_id())::text
    and (select private.is_admin())
  );

create policy logos_admin_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (select private.current_tenant_id())::text
    and (select private.is_admin())
  );

create policy logos_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (select private.current_tenant_id())::text
    and (select private.is_admin())
  );

-- ======== 20260917000003_cadastros.sql ========
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

-- ======== 20260917000004_contratos.sql ========
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

-- ======== 20260917000005_apontamentos.sql ========
-- =====================================================================
-- Etapa 4: apontamento de horas, aprovação e bloqueio de período
-- =====================================================================

create type public.time_entry_status as enum ('pendente', 'aprovado', 'rejeitado');

-- ---------------------------------------------------------------------
-- Fechamento de período (bloqueio de lançamentos)
-- ---------------------------------------------------------------------
create table public.period_locks (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  -- Lançamentos com data <= locked_through ficam bloqueados
  locked_through date,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.period_locks enable row level security;
revoke all on public.period_locks from anon;
revoke insert, update, delete on public.period_locks from authenticated;

create policy period_locks_select on public.period_locks
  for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));

create or replace function public.set_period_lock(p_locked_through date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.current_tenant_id();
begin
  if not private.is_admin() then
    raise exception 'Apenas administradores podem fechar períodos.' using errcode = '42501';
  end if;

  insert into public.period_locks (tenant_id, locked_through, updated_by, updated_at)
  values (v_tenant, p_locked_through, auth.uid(), now())
  on conflict (tenant_id) do update
    set locked_through = excluded.locked_through,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

revoke execute on function public.set_period_lock(date) from public, anon;
grant execute on function public.set_period_lock(date) to authenticated;

create or replace function private.period_locked(p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select l.locked_through >= p_date
     from public.period_locks l
     where l.tenant_id = private.current_tenant_id()),
    false
  )
$$;

-- ---------------------------------------------------------------------
-- Apontamentos
-- ---------------------------------------------------------------------
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- Sem contrato = hora interna (entra na utilização, não no custo do cliente)
  contract_id uuid references public.contracts (id) on delete set null,
  activity_id uuid not null references public.activities (id) on delete restrict,
  entry_date date not null,
  start_time time,
  end_time time,
  minutes integer not null check (minutes > 0 and minutes <= 1440),
  description text check (description is null or char_length(description) <= 500),
  -- Snapshots no momento do lançamento
  billable boolean not null default true,
  cost_per_hour numeric(12, 4),
  cost_amount numeric(14, 4) generated always as (
    round(coalesce(cost_per_hour, 0) * minutes / 60.0, 4)
  ) stored,
  status public.time_entry_status not null default 'pendente',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_times_check check (
    (start_time is null and end_time is null) or (start_time is not null and end_time is not null)
  )
);

create index time_entries_tenant_date_idx on public.time_entries (tenant_id, entry_date);
create index time_entries_employee_date_idx on public.time_entries (employee_id, entry_date);
create index time_entries_contract_idx on public.time_entries (contract_id, entry_date);
create index time_entries_status_idx on public.time_entries (tenant_id, status);

create trigger time_entries_set_updated_at
  before update on public.time_entries
  for each row execute function private.set_updated_at();

-- Snapshot do custo hora vigente na data + flag faturável da atividade
create or replace function private.time_entries_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.employee_id is distinct from old.employee_id
     or new.entry_date is distinct from old.entry_date then
    new.cost_per_hour := private.employee_hourly_cost(new.employee_id, new.entry_date);
  end if;

  if tg_op = 'INSERT' or new.activity_id is distinct from old.activity_id then
    new.billable := coalesce(
      (select a.billable from public.activities a where a.id = new.activity_id),
      true
    );
  end if;

  -- Duração calculada a partir do intervalo, quando informado
  if new.start_time is not null and new.end_time is not null then
    new.minutes := (extract(epoch from (new.end_time - new.start_time)) / 60)::integer;
    if new.minutes <= 0 then
      raise exception 'A hora final precisa ser depois da inicial.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger time_entries_snapshot
  before insert or update on public.time_entries
  for each row execute function private.time_entries_snapshot();

-- Regras de edição: período fechado, aprovação e alçada
create or replace function private.time_entries_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_manager boolean := private.is_manager();
  v_review_only boolean := false;
begin
  -- Gestor ainda pode aprovar/rejeitar em período fechado (sem mudar horas)
  if tg_op = 'UPDATE' then
    v_review_only := v_is_manager
      and new.entry_date = old.entry_date
      and new.minutes = old.minutes
      and new.employee_id = old.employee_id
      and new.contract_id is not distinct from old.contract_id
      and new.activity_id = old.activity_id;
  end if;

  if not v_review_only then
    if tg_op = 'DELETE' then
      if private.period_locked(old.entry_date) then
        raise exception 'Período fechado: não é possível excluir apontamentos dessa data.' using errcode = 'P0001';
      end if;
    else
      if private.period_locked(new.entry_date) then
        raise exception 'Período fechado: não é possível lançar ou alterar horas nessa data.' using errcode = 'P0001';
      end if;
      if tg_op = 'UPDATE' and private.period_locked(old.entry_date) then
        raise exception 'Período fechado: não é possível alterar este apontamento.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' then
    -- Ninguém cria apontamento já aprovado
    if new.status <> 'pendente' then
      raise exception 'Novos apontamentos entram como pendentes.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not v_is_manager then
      -- Colaborador só mexe no que ainda está pendente e não muda o status
      if old.status <> 'pendente' then
        raise exception 'Apontamento já revisado não pode ser alterado.' using errcode = 'P0001';
      end if;
      if new.status is distinct from old.status
         or new.reviewed_by is distinct from old.reviewed_by
         or new.review_comment is distinct from old.review_comment then
        raise exception 'Apenas gestores podem aprovar ou rejeitar apontamentos.' using errcode = '42501';
      end if;
      if new.employee_id is distinct from old.employee_id then
        raise exception 'Não é possível transferir o apontamento para outra pessoa.' using errcode = '42501';
      end if;
    end if;

    if new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  -- DELETE
  if not v_is_manager and old.status <> 'pendente' then
    raise exception 'Apontamento já revisado não pode ser excluído.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger time_entries_rules
  before insert or update or delete on public.time_entries
  for each row execute function private.time_entries_rules();

-- ---------------------------------------------------------------------
-- RLS: colaborador só enxerga os próprios apontamentos
-- ---------------------------------------------------------------------
alter table public.time_entries enable row level security;
revoke all on public.time_entries from anon;

create policy time_entries_select on public.time_entries
  for select to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and (
      (select private.is_manager())
      or employee_id = (select private.current_employee_id())
    )
  );

create policy time_entries_insert on public.time_entries
  for insert to authenticated
  with check (
    tenant_id = (select private.current_tenant_id())
    and (
      employee_id = (select private.current_employee_id())
      or (select private.is_manager())
    )
  );

create policy time_entries_update on public.time_entries
  for update to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and (
      (select private.is_manager())
      or employee_id = (select private.current_employee_id())
    )
  )
  with check (tenant_id = (select private.current_tenant_id()));

create policy time_entries_delete on public.time_entries
  for delete to authenticated
  using (
    tenant_id = (select private.current_tenant_id())
    and (
      (select private.is_manager())
      or employee_id = (select private.current_employee_id())
    )
  );

-- ---------------------------------------------------------------------
-- Aprovação em lote
-- ---------------------------------------------------------------------
create or replace function public.review_time_entries(
  p_ids uuid[],
  p_status public.time_entry_status,
  p_comment text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.current_tenant_id();
  v_count integer;
begin
  if not private.is_manager() then
    raise exception 'Apenas gestores podem revisar apontamentos.' using errcode = '42501';
  end if;
  if p_status = 'pendente' then
    raise exception 'Informe aprovado ou rejeitado.' using errcode = 'P0001';
  end if;

  update public.time_entries
  set status = p_status,
      review_comment = p_comment,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = any(p_ids)
    and tenant_id = v_tenant;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.review_time_entries(uuid[], public.time_entry_status, text) from public, anon;
grant execute on function public.review_time_entries(uuid[], public.time_entry_status, text) to authenticated;
