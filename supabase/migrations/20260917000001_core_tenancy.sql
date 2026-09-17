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
