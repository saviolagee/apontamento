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
