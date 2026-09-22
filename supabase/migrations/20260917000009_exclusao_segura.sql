-- =====================================================================
-- Etapa (ajuste): atividade sempre dentro de uma área, e exclusão segura
-- de cliente/área/atividade — sem apagar histórico por engano.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Atividade sempre dentro de uma área
-- ---------------------------------------------------------------------

-- Atividades sem área (de antes desta regra) ganham uma área "Geral" por
-- empresa, criada automaticamente se ainda não existir.
do $$
declare
  r record;
  v_area_id uuid;
begin
  for r in select distinct tenant_id from public.activities where area_id is null
  loop
    select id into v_area_id
    from public.areas
    where tenant_id = r.tenant_id and lower(name) = 'geral';

    if v_area_id is null then
      insert into public.areas (tenant_id, name, description)
      values (r.tenant_id, 'Geral', 'Criada automaticamente para atividades sem área definida.')
      returning id into v_area_id;
    end if;

    update public.activities
    set area_id = v_area_id
    where tenant_id = r.tenant_id and area_id is null;
  end loop;
end;
$$;

alter table public.activities alter column area_id set not null;

-- Antes o FK usava "on delete set null"; agora que a coluna é obrigatória,
-- apagar uma área com atividades vinculadas é bloqueado (era isso que
-- permitia esvaziar o vínculo sem querer).
alter table public.activities drop constraint activities_area_id_fkey;
alter table public.activities
  add constraint activities_area_id_fkey
  foreign key (area_id) references public.areas (id) on delete restrict;

-- ---------------------------------------------------------------------
-- 2) Cliente com contrato não pode ser excluído
--
-- O FK original usava "on delete cascade": apagar um cliente apagava os
-- contratos (e gastos, vínculos) em cascata e desvinculava os apontamentos
-- já lançados (contract_id virava null, "perdendo" o cliente do histórico).
-- Agora a exclusão só é permitida quando o cliente não tem contrato algum;
-- havendo contrato, o caminho passa a ser inativar o cliente.
-- ---------------------------------------------------------------------
alter table public.contracts drop constraint contracts_client_id_fkey;
alter table public.contracts
  add constraint contracts_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete restrict;

-- ---------------------------------------------------------------------
-- Observação: activities.id já é referenciado por time_entries.activity_id
-- com "on delete restrict" desde a etapa 4 — uma atividade com apontamentos
-- já não podia ser excluída. Esta migration cobre o que faltava (área e
-- cliente).
-- ---------------------------------------------------------------------
