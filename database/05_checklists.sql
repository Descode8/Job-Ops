-- Reusable checklist definitions and per-work-order completion state.

create table if not exists public.home_checklist_items (
  id smallserial primary key,
  item_key text not null unique,
  label text not null,
  sort_order smallint not null unique,
  is_active boolean not null default true
);

insert into public.home_checklist_items (item_key, label, sort_order)
values
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

create index if not exists work_order_checklist_order_idx on public.work_order_checklist (work_order_id, is_complete);
