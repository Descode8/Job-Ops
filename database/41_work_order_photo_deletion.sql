-- Allow active assignees and office users to remove work-order attachments.

drop policy if exists files_delete_assigned_or_office on public.work_order_files;
create policy files_delete_assigned_or_office
on public.work_order_files for delete to authenticated
using (
  public.is_office_user()
  or exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = work_order_files.work_order_id
      and wa.contractor_id = public.current_contractor_id()
      and wa.unassigned_at is null
  )
);

drop policy if exists work_order_storage_delete_admin on storage.objects;
drop policy if exists work_order_storage_delete_assigned_or_office on storage.objects;
create policy work_order_storage_delete_assigned_or_office
on storage.objects for delete to authenticated
using (
  bucket_id = 'work-order-files'
  and (
    public.is_office_user()
    or exists (
      select 1 from public.work_order_assignments wa
      where wa.work_order_id::text = (storage.foldername(name))[2]
        and wa.contractor_id = public.current_contractor_id()
        and wa.unassigned_at is null
    )
  )
);
