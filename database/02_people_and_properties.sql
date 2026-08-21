-- Users allowed to access the portal and the properties attached to work.
-- auth_user_id links to Supabase Auth when this schema is used there.

create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  phone_number text not null unique,
  email text,
  role public.user_role not null default 'contractor',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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

create index if not exists properties_city_state_idx on public.properties (city, state);

create trigger contractors_set_updated_at
before update on public.contractors
for each row execute function public.set_updated_at();

create trigger properties_set_updated_at
before update on public.properties
for each row execute function public.set_updated_at();
