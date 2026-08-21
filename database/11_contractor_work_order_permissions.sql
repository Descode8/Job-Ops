-- Allows active contractors to create work orders for themselves.
-- Run once in an existing Supabase project after the original RLS policies.

create policy properties_insert_contractor on public.properties
for insert to authenticated
with check (public.current_contractor_id() is not null);

create policy work_orders_insert_contractor on public.work_orders
for insert to authenticated
with check (created_by = public.current_contractor_id());

create policy assignments_insert_self on public.work_order_assignments
for insert to authenticated
with check (contractor_id = public.current_contractor_id() and exists (
  select 1 from public.work_orders wo
  where wo.id = work_order_assignments.work_order_id
    and wo.created_by = public.current_contractor_id()
));
