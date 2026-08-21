-- Work orders and their contractor assignments.

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

create index if not exists work_orders_property_status_idx on public.work_orders (property_id, status);
create index if not exists work_orders_priority_deadline_idx on public.work_orders (priority, deadline_at);
create index if not exists work_order_assignments_contractor_idx on public.work_order_assignments (contractor_id, work_order_id);

create trigger work_orders_set_updated_at
before update on public.work_orders
for each row execute function public.set_updated_at();

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

create trigger work_orders_set_completion_date
before update on public.work_orders
for each row execute function public.set_work_order_completion_date();
