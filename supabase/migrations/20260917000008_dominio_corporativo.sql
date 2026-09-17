-- =====================================================================
-- E-mail corporativo obrigatório: a empresa passa a ter um domínio, e quem
-- se cadastrar com um e-mail daquele domínio entra automaticamente nela.
-- =====================================================================

alter table public.tenants
  add column email_domain text,
  add column auto_join_domain boolean not null default true;

-- Um domínio pertence a uma única empresa
create unique index tenants_email_domain_key on public.tenants (lower(email_domain))
  where email_domain is not null;

comment on column public.tenants.email_domain is
  'Domínio corporativo (ex.: empresa.com.br). Define quem entra automaticamente.';
comment on column public.tenants.auto_join_domain is
  'Quando falso, só entra na empresa quem receber convite.';

-- Provedores públicos não identificam uma empresa
create or replace function private.is_public_email_domain(p_domain text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(trim(p_domain)) in (
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br',
    'live.com', 'msn.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'gmx.com', 'proton.me', 'protonmail.com', 'zoho.com', 'mail.com',
    'bol.com.br', 'uol.com.br', 'terra.com.br', 'ig.com.br', 'globo.com', 'globomail.com',
    'r7.com', 'oi.com.br', 'zipmail.com.br', 'superig.com.br', 'pop.com.br'
  )
$$;

create or replace function private.email_domain(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(trim(split_part(p_email, '@', 2))), '')
$$;

-- ---------------------------------------------------------------------
-- Criação da empresa: o domínio vem do e-mail corporativo de quem cria
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
  v_domain text;
  v_tenant_id uuid;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Usuário já pertence a uma empresa.' using errcode = 'P0001';
  end if;

  select email into v_email from auth.users where id = v_uid;
  v_domain := private.email_domain(v_email);

  if v_domain is null then
    raise exception 'Não foi possível identificar o domínio do seu e-mail.' using errcode = 'P0001';
  end if;

  if private.is_public_email_domain(v_domain) then
    raise exception
      'Para criar a empresa use um e-mail corporativo (@suaempresa.com.br). E-mails pessoais como @% não identificam uma empresa.',
      v_domain
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.tenants t where lower(t.email_domain) = v_domain) then
    raise exception
      'Já existe uma empresa cadastrada com o domínio @%. Peça um convite ao administrador dela.', v_domain
      using errcode = 'P0001';
  end if;

  insert into public.tenants (name, cnpj, email_domain)
  values (trim(p_name), nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), ''), v_domain)
  returning id into v_tenant_id;

  insert into public.profiles (id, tenant_id, full_name, email, role)
  values (v_uid, v_tenant_id, trim(p_full_name), lower(v_email), 'admin');

  insert into public.employees (tenant_id, profile_id, full_name, email)
  values (v_tenant_id, v_uid, trim(p_full_name), lower(v_email));

  return v_tenant_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Vínculo do usuário: convite pendente primeiro, domínio corporativo depois
-- ---------------------------------------------------------------------
create or replace function private.accept_invitation_for(p_user_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_employee_id uuid;
  v_tenant_id uuid;
  v_domain text;
  v_name text;
begin
  if exists (select 1 from public.profiles where id = p_user_id) then
    return (select tenant_id from public.profiles where id = p_user_id);
  end if;

  select * into v_inv
  from public.invitations i
  where lower(i.email) = lower(p_email) and i.accepted_at is null
  limit 1;

  if found then
    insert into public.profiles (id, tenant_id, full_name, email, role, can_view_costs)
    values (p_user_id, v_inv.tenant_id, v_inv.full_name, lower(p_email), v_inv.role, v_inv.can_view_costs);

    if v_inv.employee_id is not null then
      update public.employees set profile_id = p_user_id, active = true
      where id = v_inv.employee_id and tenant_id = v_inv.tenant_id;
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
  end if;

  -- Sem convite: entra pela empresa dona do domínio do e-mail corporativo
  v_domain := private.email_domain(p_email);
  if v_domain is null or private.is_public_email_domain(v_domain) then
    return null;
  end if;

  select t.id into v_tenant_id
  from public.tenants t
  where lower(t.email_domain) = v_domain and t.auto_join_domain
  limit 1;

  if v_tenant_id is null then
    return null;
  end if;

  -- Nome provisório a partir do e-mail; a pessoa ajusta depois
  v_name := initcap(replace(replace(split_part(p_email, '@', 1), '.', ' '), '_', ' '));

  insert into public.profiles (id, tenant_id, full_name, email, role)
  values (p_user_id, v_tenant_id, v_name, lower(p_email), 'colaborador');

  -- Aproveita um cadastro de colaborador já feito pelo gestor, se houver
  select e.id into v_employee_id
  from public.employees e
  where e.tenant_id = v_tenant_id and lower(e.email) = lower(p_email) and e.profile_id is null
  limit 1;

  if v_employee_id is null then
    insert into public.employees (tenant_id, profile_id, full_name, email)
    values (v_tenant_id, p_user_id, v_name, lower(p_email));
  else
    update public.employees set profile_id = p_user_id, active = true where id = v_employee_id;
  end if;

  return v_tenant_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Admin ajusta o domínio da empresa (empresas criadas antes desta mudança
-- começam sem domínio definido)
-- ---------------------------------------------------------------------
create or replace function public.set_tenant_domain(p_domain text, p_auto_join boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.current_tenant_id();
  v_domain text := nullif(lower(trim(regexp_replace(coalesce(p_domain, ''), '^.*@', ''))), '');
begin
  if not private.is_admin() then
    raise exception 'Apenas administradores podem alterar o domínio da empresa.' using errcode = '42501';
  end if;

  if v_domain is null then
    raise exception 'Informe o domínio corporativo da empresa.' using errcode = 'P0001';
  end if;

  if v_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
    raise exception 'Domínio inválido. Use o formato suaempresa.com.br.' using errcode = 'P0001';
  end if;

  if private.is_public_email_domain(v_domain) then
    raise exception 'Use um domínio corporativo: @% é um provedor de e-mail pessoal.', v_domain
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.tenants t where lower(t.email_domain) = v_domain and t.id <> v_tenant) then
    raise exception 'O domínio @% já pertence a outra empresa.', v_domain using errcode = 'P0001';
  end if;

  update public.tenants
  set email_domain = v_domain, auto_join_domain = coalesce(p_auto_join, true)
  where id = v_tenant;
end;
$$;

revoke execute on function public.set_tenant_domain(text, boolean) from public, anon;
grant execute on function public.set_tenant_domain(text, boolean) to authenticated;
