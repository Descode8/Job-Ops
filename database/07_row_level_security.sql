-- Row Level Security for Supabase.
-- Run after 06_reviews_communications_audit.sql.
-- Contractors can access only their assigned work and related records.
-- Office staff and admins can manage all operational records.

alter table public.contractors enable row level security;
alter table public.properties enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_assignments enable row level security;
alter table public.work_order_files enable row level security;
alter table public.work_order_notes enable row level security;
alter table public.work_order_materials enable row level security;
alter table public.home_checklist_items enable row level security;
alter table public.work_order_checklist enable row level security;
alter table public.work_order_reviews enable row level security;
alter table public.email_deliveries enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;

create or replace function public.current_contractor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.contractors where auth_user_id = auth.uid() and is_active = true limit 1;
$$;

create or replace function public.is_office_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.contractors
    where auth_user_id = auth.uid()
      and is_active = true
      and role in ('office_staff', 'admin')
  );
$$;

create policy contractors_read_self_or_office on public.contractors
for select to authenticated
using (id = public.current_contractor_id() or public.is_office_user());

create policy contractors_manage_office on public.contractors
for all to authenticated
using (public.is_office_user())
with check (public.is_office_user());

create policy properties_read_assigned_or_office on public.properties
for select to authenticated
using (
  public.is_office_user()
  or exists (
    select 1 from public.work_orders wo
    join public.work_order_assignments wa on wa.work_order_id = wo.id
    where wo.property_id = properties.id
      and wa.contractor_id = public.current_contractor_id()
      and wa.unassigned_at is null
  )
);

create policy properties_manage_office on public.properties
for all to authenticated
using (public.is_office_user())
with check (public.is_office_user());

create policy properties_insert_contractor on public.properties
for insert to authenticated
with check (public.current_contractor_id() is not null);

create policy work_orders_read_assigned_or_office on public.work_orders
for select to authenticated
using (
  public.is_office_user()
  or exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = work_orders.id
      and wa.contractor_id = public.current_contractor_id()
      and wa.unassigned_at is null
  )
);

create policy work_orders_manage_office on public.work_orders
for all to authenticated
using (public.is_office_user())
with check (public.is_office_user());

create policy work_orders_insert_contractor on public.work_orders
for insert to authenticated
with check (created_by = public.current_contractor_id());

create policy assignments_read_assigned_or_office on public.work_order_assignments
for select to authenticated
using (public.is_office_user() or contractor_id = public.current_contractor_id());

create policy assignments_manage_office on public.work_order_assignments
for all to authenticated
using (public.is_office_user())
with check (public.is_office_user());

create policy assignments_insert_self on public.work_order_assignments
for insert to authenticated
with check (contractor_id = public.current_contractor_id() and exists (
  select 1 from public.work_orders wo
  where wo.id = work_order_assignments.work_order_id
    and wo.created_by = public.current_contractor_id()
));

create policy files_read_assigned_or_office on public.work_order_files
for select to authenticated
using (
  public.is_office_user()
  or exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = work_order_files.work_order_id
      and wa.contractor_id = public.current_contractor_id()
      and wa.unassigned_at is null
  )
);

create policy files_insert_assigned_or_office on public.work_order_files
for insert to authenticated
with check (
  public.is_office_user()
  or (
    uploaded_by = public.current_contractor_id()
    and exists (
      select 1 from public.work_order_assignments wa
      where wa.work_order_id = work_order_files.work_order_id
        and wa.contractor_id = public.current_contractor_id()
        and wa.unassigned_at is null
    )
  )
);

create policy notes_read_assigned_or_office on public.work_order_notes
for select to authenticated
using (
  public.is_office_user()
  or exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = work_order_notes.work_order_id
      and wa.contractor_id = public.current_contractor_id()
      and wa.unassigned_at is null
  )
);

create policy notes_insert_assigned_or_office on public.work_order_notes
for insert to authenticated
with check (
  public.is_office_user()
  or (
    author_id = public.current_contractor_id()
    and exists (
      select 1 from public.work_order_assignments wa
      where wa.work_order_id = work_order_notes.work_order_id
        and wa.contractor_id = public.current_contractor_id()
        and wa.unassigned_at is null
    )
  )
);

create policy materials_read_assigned_or_office on public.work_order_materials
for select to authenticated
using (
  public.is_office_user()
  or exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = work_order_materials.work_order_id
      and wa.contractor_id = public.current_contractor_id()
      and wa.unassigned_at is null
  )
);

create policy materials_insert_assigned_or_office on public.work_order_materials
for insert to authenticated
with check (
  public.is_office_user()
  or (
    added_by = public.current_contractor_id()
    and exists (
      select 1 from public.work_order_assignments wa
      where wa.work_order_id = work_order_materials.work_order_id
        and wa.contractor_id = public.current_contractor_id()
        and wa.unassigned_at is null
    )
  )
);

create policy checklist_items_read_authenticated on public.home_checklist_items
for select to authenticated using (true);

create policy checklist_read_assigned_or_office on public.work_order_checklist
for select to authenticated
using (
  public.is_office_user()
  or exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = work_order_checklist.work_order_id
      and wa.contractor_id = public.current_contractor_id()
      and wa.unassigned_at is null
  )
);

create policy checklist_update_assigned_or_office on public.work_order_checklist
for all to authenticated
using (
  public.is_office_user()
  or exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = work_order_checklist.work_order_id
      and wa.contractor_id = public.current_contractor_id()
      and wa.unassigned_at is null
  )
)
with check (
  public.is_office_user()
  or exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = work_order_checklist.work_order_id
      and wa.contractor_id = public.current_contractor_id()
      and wa.unassigned_at is null
  )
);

create policy reviews_read_assigned_or_office on public.work_order_reviews
for select to authenticated
using (
  public.is_office_user()
  or exists (
    select 1 from public.work_order_assignments wa
    where wa.work_order_id = work_order_reviews.work_order_id
      and wa.contractor_id = public.current_contractor_id()
      and wa.unassigned_at is null
  )
);

create policy reviews_manage_office on public.work_order_reviews
for all to authenticated
using (public.is_office_user())
with check (public.is_office_user());

create policy notifications_read_self_or_office on public.notifications
for select to authenticated
using (public.is_office_user() or contractor_id = public.current_contractor_id());

create policy notifications_update_self_or_office on public.notifications
for update to authenticated
using (public.is_office_user() or contractor_id = public.current_contractor_id())
with check (public.is_office_user() or contractor_id = public.current_contractor_id());

create policy email_deliveries_read_office on public.email_deliveries
for select to authenticated using (public.is_office_user());

create policy audit_events_read_office on public.audit_events
for select to authenticated using (public.is_office_user());
