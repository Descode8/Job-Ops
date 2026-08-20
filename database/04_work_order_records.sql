-- Evidence, notes, and materials attached to a specific work order.

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

create index if not exists work_order_files_order_type_idx on public.work_order_files (work_order_id, file_type);
create index if not exists work_order_notes_order_idx on public.work_order_notes (work_order_id, created_at);
create index if not exists work_order_materials_order_idx on public.work_order_materials (work_order_id);

create trigger work_order_notes_set_updated_at
before update on public.work_order_notes
for each row execute function public.set_updated_at();
