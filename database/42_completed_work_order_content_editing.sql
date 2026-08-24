-- Allow admins and active assignees to remove job notes regardless of work-order status.
-- File inserts/deletes already use assignment-based policies and do not restrict completed orders.

drop policy if exists notes_delete_assigned_or_office on public.work_order_notes;
create policy notes_delete_assigned_or_office
on public.work_order_notes for delete to authenticated
using (
  public.is_office_user()
  or exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = work_order_notes.work_order_id
      and wa.contractor_id = public.current_contractor_id()
      and wa.unassigned_at is null
  )
);
