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
