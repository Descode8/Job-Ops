-- Keep work-order media private while allowing the people involved with the
-- work order to open files uploaded by an administrator or another contractor.

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
