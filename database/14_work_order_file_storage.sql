-- Private storage for contractor work-order photos, invoices, and documents.

insert into storage.buckets (id, name, public, file_size_limit)
values ('work-order-files', 'work-order-files', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

create policy work_order_storage_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'work-order-files'
  and (storage.foldername(name))[1] = public.current_contractor_id()::text
);

create policy work_order_storage_read_own
on storage.objects for select to authenticated
using (
  bucket_id = 'work-order-files'
  and ((storage.foldername(name))[1] = public.current_contractor_id()::text or public.is_office_user())
);
