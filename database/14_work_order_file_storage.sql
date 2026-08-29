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

drop policy if exists work_order_storage_read_own on storage.objects;
drop policy if exists work_order_storage_read_authorized on storage.objects;
create policy work_order_storage_read_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'work-order-files'
  and (
    (storage.foldername(name))[1] = public.current_contractor_id()::text
    or public.is_office_user()
    or exists (
      select 1 from public.work_order_assignments wa
      where wa.work_order_id::text = (storage.foldername(name))[2]
        and wa.contractor_id = public.current_contractor_id()
        and wa.unassigned_at is null
    )
    or exists (
      select 1 from public.work_order_offers wo
      where wo.work_order_id::text = (storage.foldername(name))[2]
        and wo.recipient_id = public.current_contractor_id()
        and wo.status = 'pending'
    )
  )
);
