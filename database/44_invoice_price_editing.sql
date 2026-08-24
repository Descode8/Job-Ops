-- Allow admins and active assignees to edit invoice prices on any assigned work order,
-- including completed work orders. Limit updates to invoice records.

drop policy if exists files_update_invoice_price_assigned_or_office on public.work_order_files;
create policy files_update_invoice_price_assigned_or_office
on public.work_order_files for update to authenticated
using (
  file_type = 'invoice'
  and (
    public.is_office_user()
    or exists (
      select 1 from public.work_order_assignments wa
      where wa.work_order_id = work_order_files.work_order_id
        and wa.contractor_id = public.current_contractor_id()
        and wa.unassigned_at is null
    )
  )
)
with check (
  file_type = 'invoice'
  and invoice_amount >= 0
  and (
    public.is_office_user()
    or exists (
      select 1 from public.work_order_assignments wa
      where wa.work_order_id = work_order_files.work_order_id
        and wa.contractor_id = public.current_contractor_id()
        and wa.unassigned_at is null
    )
  )
);
