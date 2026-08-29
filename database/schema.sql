-- JobOps Contractor Portal
-- Copy and paste this entire file into the Supabase SQL Editor, then choose
-- "Run and enable RLS" when Supabase displays the security warning.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

do $$ begin
  create type public.user_role as enum ('contractor', 'office_staff', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.work_order_priority as enum ('low', 'medium', 'high', 'emergency');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.work_order_status as enum ('not_started', 'in_progress', 'submitted', 'approved', 'rejected', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.work_order_kind as enum ('installation', 'service', 'inspection', 'repair', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.file_type as enum ('issue_photo', 'parts_photo', 'before_photo', 'after_photo', 'completion_photo', 'completion_video', 'invoice', 'quote', 'material_list', 'receipt', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.review_decision as enum ('approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.delivery_status as enum ('queued', 'sent', 'delivered', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  phone_number text not null unique,
  email text,
  role public.user_role not null default 'contractor',
  is_active boolean not null default true,
  sms_consent boolean not null default false,
  sms_consent_at timestamptz,
  sms_consent_source text,
  sms_consent_disclosure_version text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.contractors drop constraint if exists contractors_sms_consent_timestamp_check;
alter table public.contractors add constraint contractors_sms_consent_timestamp_check
  check (sms_consent = (sms_consent_at is not null)
    and sms_consent = (sms_consent_source is not null)
    and sms_consent = (sms_consent_disclosure_version is not null));

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  customer_name text,
  customer_phone text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  work_order_number text not null unique,
  property_id uuid not null references public.properties(id) on delete restrict,
  title text not null,
  description text not null,
  kind public.work_order_kind not null default 'installation',
  priority public.work_order_priority not null default 'medium',
  status public.work_order_status not null default 'not_started',
  requested_at timestamptz not null default timezone('utc', now()),
  deadline_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.contractors(id) on delete set null,
  recipient_email text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.work_order_assignments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  assigned_at timestamptz not null default timezone('utc', now()),
  unassigned_at timestamptz,
  unique (work_order_id, contractor_id)
);

create table if not exists public.work_order_files (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  uploaded_by uuid references public.contractors(id) on delete set null,
  file_type public.file_type not null,
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  file_size_bytes bigint,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.work_order_notes (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  author_id uuid references public.contractors(id) on delete set null,
  note text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.work_order_materials (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  added_by uuid references public.contractors(id) on delete set null,
  material_name text not null,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit text not null default 'each',
  unit_cost numeric(12, 2) check (unit_cost is null or unit_cost >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.home_checklist_items (
  id smallserial primary key,
  item_key text not null unique,
  label text not null,
  sort_order smallint not null unique,
  is_active boolean not null default true
);

insert into public.home_checklist_items (item_key, label, sort_order) values
  ('plumbing', 'Plumbing', 1),
  ('meter', 'Meter', 2),
  ('hvac', 'HVAC', 3),
  ('underpinning', 'Underpinning', 4),
  ('steps_decks', 'Steps / Decks', 5),
  ('well', 'Well', 6),
  ('septic', 'Septic', 7),
  ('plumbing_tie_in', 'Plumbing tie-in', 8),
  ('waterline', 'Waterline', 9),
  ('backfill_seed_straw', 'Backfill, Seed & Straw', 10),
  ('driveway', 'Driveway', 11),
  ('get_ready', 'Get ready', 12),
  ('meter_install', 'Meter install', 13),
  ('final_walkthrough', 'Final walk-through', 14)
on conflict (item_key) do nothing;

create table if not exists public.work_order_checklist (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  checklist_item_id smallint not null references public.home_checklist_items(id) on delete restrict,
  is_complete boolean not null default false,
  completed_by uuid references public.contractors(id) on delete set null,
  completed_at timestamptz,
  notes text,
  unique (work_order_id, checklist_item_id)
);

create table if not exists public.work_order_reviews (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  reviewer_id uuid references public.contractors(id) on delete set null,
  decision public.review_decision not null,
  feedback text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references public.work_orders(id) on delete set null,
  requested_by uuid references public.contractors(id) on delete set null,
  recipient_email text not null,
  subject text not null,
  email_type text not null check (email_type in ('work_order_created', 'completion_notice', 'check_request', 'export')),
  provider_message_id text,
  status public.delivery_status not null default 'queued',
  error_message text,
  queued_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz,
  delivered_at timestamptz
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid references public.contractors(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.contractors(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists properties_city_state_idx on public.properties (city, state);
create index if not exists work_orders_property_status_idx on public.work_orders (property_id, status);
create index if not exists work_orders_priority_deadline_idx on public.work_orders (priority, deadline_at);
create index if not exists assignments_contractor_idx on public.work_order_assignments (contractor_id, work_order_id);
create index if not exists files_order_type_idx on public.work_order_files (work_order_id, file_type);
create index if not exists notes_order_idx on public.work_order_notes (work_order_id, created_at);
create index if not exists materials_order_idx on public.work_order_materials (work_order_id);
create index if not exists checklist_order_idx on public.work_order_checklist (work_order_id, is_complete);
create index if not exists email_status_idx on public.email_deliveries (status, queued_at);
create index if not exists notifications_contractor_idx on public.notifications (contractor_id, read_at, created_at);
create index if not exists audit_order_idx on public.audit_events (work_order_id, created_at);

create or replace function public.current_contractor_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.contractors
  where auth_user_id = auth.uid() and is_active = true limit 1;
$$;

create or replace function public.is_office_user()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.contractors
    where auth_user_id = auth.uid()
      and is_active = true
      and role in ('office_staff', 'admin')
  );
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'contractors_set_updated_at') then
    create trigger contractors_set_updated_at before update on public.contractors for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'properties_set_updated_at') then
    create trigger properties_set_updated_at before update on public.properties for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'work_orders_set_updated_at') then
    create trigger work_orders_set_updated_at before update on public.work_orders for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'work_order_notes_set_updated_at') then
    create trigger work_order_notes_set_updated_at before update on public.work_order_notes for each row execute function public.set_updated_at();
  end if;
end;
$$;

create or replace function public.set_work_order_completion_date()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed' or new.completed_at is null) then
    new.completed_at = coalesce(new.completed_at, timezone('utc', now()));
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'work_orders_set_completion_date') then
    create trigger work_orders_set_completion_date before update on public.work_orders for each row execute function public.set_work_order_completion_date();
  end if;
end;
$$;

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

create policy contractors_read_self_or_office on public.contractors for select to authenticated
using (id = public.current_contractor_id() or public.is_office_user());
create policy contractors_manage_office on public.contractors for all to authenticated
using (public.is_office_user()) with check (public.is_office_user());

create policy properties_read_assigned_or_office on public.properties for select to authenticated
using (public.is_office_user() or exists (
  select 1 from public.work_orders wo join public.work_order_assignments wa on wa.work_order_id = wo.id
  where wo.property_id = properties.id and wa.contractor_id = public.current_contractor_id() and wa.unassigned_at is null
));
create policy properties_manage_office on public.properties for all to authenticated
using (public.is_office_user()) with check (public.is_office_user());
create policy properties_insert_contractor on public.properties for insert to authenticated
with check (public.current_contractor_id() is not null);

create policy work_orders_read_assigned_or_office on public.work_orders for select to authenticated
using (public.is_office_user() or exists (
  select 1 from public.work_order_assignments wa
  where wa.work_order_id = work_orders.id and wa.contractor_id = public.current_contractor_id() and wa.unassigned_at is null
));
create policy work_orders_manage_office on public.work_orders for all to authenticated
using (public.is_office_user()) with check (public.is_office_user());
create policy work_orders_insert_contractor on public.work_orders for insert to authenticated
with check (created_by = public.current_contractor_id());

create policy assignments_read_assigned_or_office on public.work_order_assignments for select to authenticated
using (public.is_office_user() or contractor_id = public.current_contractor_id());
create policy assignments_manage_office on public.work_order_assignments for all to authenticated
using (public.is_office_user()) with check (public.is_office_user());
create policy assignments_insert_self on public.work_order_assignments for insert to authenticated
with check (contractor_id = public.current_contractor_id() and exists (
  select 1 from public.work_orders wo
  where wo.id = work_order_assignments.work_order_id and wo.created_by = public.current_contractor_id()
));

create policy files_read_assigned_or_office on public.work_order_files for select to authenticated
using (public.is_office_user() or exists (
  select 1 from public.work_order_assignments wa
  where wa.work_order_id = work_order_files.work_order_id and wa.contractor_id = public.current_contractor_id() and wa.unassigned_at is null
));
create policy files_insert_assigned_or_office on public.work_order_files for insert to authenticated
with check (public.is_office_user() or (uploaded_by = public.current_contractor_id() and exists (
  select 1 from public.work_order_assignments wa
  where wa.work_order_id = work_order_files.work_order_id and wa.contractor_id = public.current_contractor_id() and wa.unassigned_at is null
)));

create policy notes_read_assigned_or_office on public.work_order_notes for select to authenticated
using (public.is_office_user() or exists (
  select 1 from public.work_order_assignments wa
  where wa.work_order_id = work_order_notes.work_order_id and wa.contractor_id = public.current_contractor_id() and wa.unassigned_at is null
));
create policy notes_insert_assigned_or_office on public.work_order_notes for insert to authenticated
with check (public.is_office_user() or (author_id = public.current_contractor_id() and exists (
  select 1 from public.work_order_assignments wa
  where wa.work_order_id = work_order_notes.work_order_id and wa.contractor_id = public.current_contractor_id() and wa.unassigned_at is null
)));

create policy materials_read_assigned_or_office on public.work_order_materials for select to authenticated
using (public.is_office_user() or exists (
  select 1 from public.work_order_assignments wa
  where wa.work_order_id = work_order_materials.work_order_id and wa.contractor_id = public.current_contractor_id() and wa.unassigned_at is null
));
create policy materials_insert_assigned_or_office on public.work_order_materials for insert to authenticated
with check (public.is_office_user() or (added_by = public.current_contractor_id() and exists (
  select 1 from public.work_order_assignments wa
  where wa.work_order_id = work_order_materials.work_order_id and wa.contractor_id = public.current_contractor_id() and wa.unassigned_at is null
)));

create policy checklist_items_read_authenticated on public.home_checklist_items for select to authenticated using (true);
create policy checklist_read_assigned_or_office on public.work_order_checklist for select to authenticated
using (public.is_office_user() or exists (
  select 1 from public.work_order_assignments wa
  where wa.work_order_id = work_order_checklist.work_order_id and wa.contractor_id = public.current_contractor_id() and wa.unassigned_at is null
));
create policy checklist_update_assigned_or_office on public.work_order_checklist for all to authenticated
using (public.is_office_user() or exists (
  select 1 from public.work_order_assignments wa
  where wa.work_order_id = work_order_checklist.work_order_id and wa.contractor_id = public.current_contractor_id() and wa.unassigned_at is null
)) with check (public.is_office_user() or exists (
  select 1 from public.work_order_assignments wa
  where wa.work_order_id = work_order_checklist.work_order_id and wa.contractor_id = public.current_contractor_id() and wa.unassigned_at is null
));

create policy reviews_read_assigned_or_office on public.work_order_reviews for select to authenticated
using (public.is_office_user() or exists (
  select 1 from public.work_order_assignments wa
  where wa.work_order_id = work_order_reviews.work_order_id and wa.contractor_id = public.current_contractor_id() and wa.unassigned_at is null
));
create policy reviews_manage_office on public.work_order_reviews for all to authenticated
using (public.is_office_user()) with check (public.is_office_user());

create policy notifications_read_self_or_office on public.notifications for select to authenticated
using (public.is_office_user() or contractor_id = public.current_contractor_id());
create policy notifications_update_self_or_office on public.notifications for update to authenticated
using (public.is_office_user() or contractor_id = public.current_contractor_id())
with check (public.is_office_user() or contractor_id = public.current_contractor_id());
create policy email_deliveries_read_office on public.email_deliveries for select to authenticated
using (public.is_office_user());
create policy audit_events_read_office on public.audit_events for select to authenticated
using (public.is_office_user());

create or replace function public.set_my_sms_consent(p_consent boolean)
returns table (sms_consent boolean, sms_consent_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  update public.contractors
  set sms_consent = p_consent,
      sms_consent_at = case when p_consent then timezone('utc', now()) else null end,
      sms_consent_source = case when p_consent then 'jobops_login' else null end,
      sms_consent_disclosure_version = case when p_consent then '2026-08-29' else null end
  where auth_user_id = auth.uid() and is_active = true;
  if not found then raise exception 'Active contractor access required'; end if;
  return query select c.sms_consent, c.sms_consent_at from public.contractors c where c.auth_user_id = auth.uid();
end;
$$;
revoke all on function public.set_my_sms_consent(boolean) from public;
grant execute on function public.set_my_sms_consent(boolean) to authenticated;
